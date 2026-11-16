// The oxiMACHINE model, as backend/oximachine_api/model.py, from the files
// backend/scripts/build_web_model.py writes to public/model/: the ensemble
// (scaler, four isotonic-calibrated estimators, soft voting), the nearest
// training structures, SHAP values (shap's TreeExplainer over the extra
// trees) and the percentile of each feature in the training set. The
// training points for the nearest neighbours are fetched in chunks, as the
// searches need them (see Neighbours).

const EPS32 = 1.1920928955078125e-7; // np.finfo(np.float32).eps

// Servers may already have decompressed a .gz file (Content-Encoding: gzip,
// e.g. Vite's dev server), so only gunzip what still starts with gzip's magic bytes
async function gunzip(blob) {
  const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (magic[0] !== 0x1f || magic[1] !== 0x8b) return blob.arrayBuffer();
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

/** Fetch the model files (in the browser). */
export async function fetchModel(baseUrl) {
  const manifest = await (await fetch(`${baseUrl}manifest.json`)).json();
  const fetchChunk = async (c) => {
    const res = await fetch(`${baseUrl}rows/${c}.bin.gz`);
    if (!res.ok) throw new Error(`Could not download the model data (rows/${c}, HTTP ${res.status})`);
    return gunzip(await res.blob());
  };
  return loadModel(manifest, await gunzip(await (await fetch(`${baseUrl}model.bin.gz`)).blob()), fetchChunk);
}

const TYPES = { float64: Float64Array, int32: Int32Array, uint8: Uint8Array, int8: Int8Array };

/**
 * The model from its manifest, the (decompressed) blob, and
 * fetchChunk(c): the decompressed rows/<c>.bin.gz.
 */
export function loadModel(manifest, buffer, fetchChunk) {
  // Every {offset, shape, dtype} in the manifest becomes a typed array view
  const resolve = (spec) => {
    if (Array.isArray(spec)) return spec.map(resolve);
    if (spec === null || typeof spec !== "object") return spec;
    if ("offset" in spec && "dtype" in spec) {
      const size = spec.shape.reduce((a, b) => a * b, 1);
      return Object.assign(new TYPES[spec.dtype](buffer, spec.offset, size), { shape: spec.shape });
    }
    return Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, resolve(v)]));
  };
  return new OximachineModel(resolve(manifest), fetchChunk);
}

const rows = (array) => {
  const [n, m] = array.shape;
  return Array.from({ length: n }, (_, i) => array.subarray(i * m, (i + 1) * m));
};
const argmax = (a) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0);

/** sklearn tree: leaf of a row, compared as float32 (sklearn casts X). */
function tree(spec, keys = ["children_left", "children_right", "feature", "threshold", "value"]) {
  const [left, right, feature, threshold, value] = keys.map((k) => spec[k]);
  const width = value.length / left.length;
  return {
    left,
    right,
    feature,
    threshold,
    value: (node) => value.subarray(node * width, (node + 1) * width),
    leaf(x32) {
      let node = 0;
      while (left[node] !== -1) node = x32[feature[node]] <= threshold[node] ? left[node] : right[node];
      return node;
    },
  };
}

function baseEstimator(spec, neighbours) {
  switch (spec.type) {
    case "SGDClassifier": {
      const coef = rows(spec.coef);
      return { decision: (x) => coef.map((c, k) => x.reduce((s, v, j) => s + v * c[j], 0) + spec.intercept[k]) };
    }
    case "GradientBoostingClassifier": {
      const stages = spec.trees.map((stage) => stage.map((t) => tree(t)));
      const prior = Array.from(spec.init_class_prior, (p) => Math.log(Math.min(Math.max(p, EPS32), 1 - EPS32)));
      return {
        decision(x) {
          const x32 = Float32Array.from(x);
          const raw = [...prior];
          for (const stage of stages) stage.forEach((t, k) => (raw[k] += spec.learning_rate * t.value(t.leaf(x32))[0]));
          return raw;
        },
      };
    }
    case "ExtraTreesClassifier": {
      const trees = spec.trees.map((t) => tree(t));
      return {
        proba(x) {
          const x32 = Float32Array.from(x);
          const proba = new Array(spec.n_classes).fill(0);
          for (const t of trees) {
            const p = t.value(t.leaf(x32)).subarray(0, spec.n_classes);
            const norm = p.reduce((a, b) => a + b, 0) || 1;
            p.forEach((v, c) => (proba[c] += v / norm));
          }
          return proba.map((v) => v / trees.length);
        },
      };
    }
    case "KNeighborsClassifier": {
      if (spec.metric !== "manhattan" || spec.weights !== "distance") throw new Error("kNN: not ported");
      return {
        async proba(x) {
          // i: position in fit_rows, the order of the training set (ties)
          const nearest = await neighbours.nearest(x, spec.n_neighbors, "manhattan", spec.fit_rows);
          // sklearn: neighbours at distance 0 take all the weight
          const exact = nearest.some((nb) => nb.d === 0);
          const votes = new Array(spec.classes.length).fill(0);
          for (const nb of nearest) if (!exact || nb.d === 0) votes[spec.y[nb.i]] += exact ? 1 : 1 / nb.d;
          const total = votes.reduce((a, b) => a + b, 0);
          return votes.map((v) => v / total);
        },
      };
    }
    default:
      throw new Error(`Unknown estimator ${spec.type}`);
  }
}

/**
 * Exact nearest training points, fetching their exact values in chunks only
 * as needed. Every point has a coarse copy (per feature, a bin with its
 * smallest and largest value), which bounds its distance to a query from
 * below. Points are visited by increasing bound and their exact distance
 * computed, until no bound is below the k-th distance found: the result is
 * that of a search over all points. Bounds and distances add the features in
 * the same order, and each bound term is at most the distance term, so the
 * bounds hold in floating point too.
 */
class Neighbours {
  constructor({ rows: n, chunk_rows: chunkRows, order, codes, bin_lo: lo, bin_hi: hi }, fetchChunk) {
    Object.assign(this, { n, chunkRows, codes, lo, hi, fetchChunk });
    this.m = lo.shape[0];
    this.bins = lo.shape[1];
    this.position = new Int32Array(n);
    order.forEach((point, p) => (this.position[point] = p));
    this.chunks = new Map(); // chunk -> Promise of its rows (Float64Array)
    this.columns = new WeakMap(); // points -> per feature, the codes of those points
  }

  /** Per feature, the bin codes of `points` (all if null), contiguous. */
  codeColumns(points) {
    const { m, n, codes } = this;
    if (!points) return Array.from({ length: m }, (_, j) => codes.subarray(j * n, (j + 1) * n));
    if (!this.columns.has(points)) {
      this.columns.set(points, Array.from({ length: m }, (_, j) => {
        const column = codes.subarray(j * n, (j + 1) * n);
        return Uint8Array.from(points, (point) => column[point]);
      }));
    }
    return this.columns.get(points);
  }

  chunk(c) {
    if (!this.chunks.has(c)) {
      const rows = this.fetchChunk(c).then((buffer) => new Float64Array(buffer));
      rows.catch(() => this.chunks.delete(c)); // retry next time
      this.chunks.set(c, rows);
    }
    return this.chunks.get(c);
  }

  /**
   * The k points of `points` (all if omitted) closest to x, closest first
   * (ties: lower index in `points` first): [{ i: index in points, d }].
   * d: manhattan distance, or the squared euclidean distance.
   */
  async nearest(x, k, metric, points = null) {
    const { m, n, bins, lo, hi, chunkRows } = this;
    const count = points ? points.length : n;
    const point = (i) => (points ? points[i] : i);
    const l1 = metric === "manhattan";

    const columns = this.codeColumns(points);
    const bound = new Float64Array(count);
    const gap = new Float64Array(bins);
    for (let j = 0; j < m; j++) {
      for (let b = 0; b < bins; b++) {
        const g = Math.max(lo[j * bins + b] - x[j], 0) + Math.max(x[j] - hi[j * bins + b], 0);
        gap[b] = l1 ? g : g * g;
      }
      const column = columns[j];
      for (let i = 0; i < count; i++) bound[i] += gap[column[i]];
    }

    const best = []; // { i, d }, by (d, i)
    const kth = () => (best.length < k ? Infinity : best[k - 1].d);
    // Sorting all bounds costs more than the search: sort only those up to a
    // limit (first the 64 smallest), and raise it while the k-th distance is above it.
    let visited = -Infinity; // all bounds up to this were candidates
    let limit = bound.slice().sort()[Math.min(63, count - 1)];
    for (;;) {
      const byBound = [];
      for (let i = 0; i < count; i++) if (bound[i] > visited && bound[i] <= limit) byBound.push(i);
      byBound.sort((a, b) => bound[a] - bound[b] || a - b);
      for (let p = 0; p < byBound.length && bound[byBound[p]] <= kth(); ) {
        // the next points that can still be among the k nearest, at most 64
        let q = p;
        while (q < byBound.length && q - p < 64 && bound[byBound[q]] <= kth()) q++;
        const batch = byBound.slice(p, q);
        const positions = batch.map((i) => this.position[point(i)]);
        const loaded = new Map(
          await Promise.all([...new Set(positions.map((pos) => Math.floor(pos / chunkRows)))].map(async (c) => [c, await this.chunk(c)])),
        );
        batch.forEach((i, b) => {
          const pos = positions[b];
          const offset = (pos % chunkRows) * m;
          const row = loaded.get(Math.floor(pos / chunkRows));
          let d = 0;
          if (l1) for (let j = 0; j < m; j++) d += Math.abs(row[offset + j] - x[j]);
          else for (let j = 0; j < m; j++) d += (row[offset + j] - x[j]) ** 2;
          if (best.length < k || d < best[k - 1].d || (d === best[k - 1].d && i < best[k - 1].i)) {
            const at = best.findIndex((e) => e.d > d || (e.d === d && e.i > i));
            best.splice(at < 0 ? best.length : at, 0, { i, d });
            if (best.length > k) best.pop();
          }
        });
        p = q;
      }
      // every point with a bound up to the k-th distance has been a candidate
      if (kth() <= limit) return best;
      [visited, limit] = [limit, kth()];
    }
  }
}

/** np.interp(np.clip(t, X_min, X_max), X, y) */
function isotonic({ X, y, X_min, X_max }) {
  return (t) => {
    const v = Math.min(Math.max(t, X_min), X_max);
    if (v < X[0]) return y[0];
    if (v >= X[X.length - 1]) return y[y.length - 1];
    let lo = 0;
    let hi = X.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (X[mid] <= v) lo = mid;
      else hi = mid;
    }
    const slope = (y[lo + 1] - y[lo]) / (X[lo + 1] - X[lo]);
    return slope * (v - X[lo]) + y[lo];
  };
}

/** sklearn 0.22 calibration._CalibratedClassifier.predict_proba (more than 2 classes). */
function calibrated(spec, neighbours) {
  const base = baseEstimator(spec.base, neighbours);
  const calibrators = spec.calibrators.map(isotonic);
  const n = spec.classes.length;
  return async (x) => {
    const df = spec.uses_decision_function ? base.decision(x) : await base.proba(x);
    const proba = new Array(n).fill(0);
    spec.pos_class_idx.forEach((k, c) => (proba[k] = calibrators[c](df[c])));
    const sum = proba.reduce((a, b) => a + b, 0);
    return proba.map((p) => {
      const v = Number.isNaN(p / sum) ? 1 / n : p / sum;
      return v > 1 && v <= 1 + 1e-5 ? 1 : v;
    });
  };
}

/** x moved by `ulps` units in the last place (x >= 0). */
function addUlps(x, ulps) {
  const f = new Float64Array([x]);
  const bits = new BigInt64Array(f.buffer);
  bits[0] += BigInt(ulps);
  return f[0];
}

/**
 * The explainer's trees: the extra trees with values v / w / n (w: the
 * node's sample weight, n: the number of trees), corrected to shap's
 * rounding by the stored ulps.
 */
function shapTrees(extraTrees, explainerTrees) {
  const n = extraTrees.trees.length;
  return extraTrees.trees.map((spec, t) => {
    const { node_sample_weight: weight, value_ulps: ulps } = explainerTrees[t];
    const outputs = ulps.length / weight.length;
    const width = spec.value.length / weight.length;
    const values = Float64Array.from(ulps, (u, i) => {
      const node = Math.floor(i / outputs);
      return addUlps(spec.value[node * width + (i % outputs)] / weight[node] / n, u);
    });
    return { ...tree({ ...spec, value: values }), cover: weight };
  });
}

class OximachineModel {
  constructor(manifest, fetchChunk) {
    const { model, explainer } = manifest;
    this.version = manifest.model_version;
    this.featureNames = manifest.feature_names;
    this.featureCategories = manifest.feature_categories;
    this.mean = model.scaler.mean;
    this.scaleBy = model.scaler.scale;
    this.classes = model.classifier.classes;
    if (model.classifier.voting !== "soft" || model.classifier.weights !== null) throw new Error("Only soft voting");
    this.neighbours = new Neighbours(model.neighbors.data, fetchChunk);
    this.estimators = model.classifier.estimators.map((e) => calibrated(e, this.neighbours));
    this.trainingNames = manifest.training_names;
    this.percentileSteps = manifest.percentiles;

    // The explainer is over the extra trees, whose outputs are their own classes
    const extraTrees = model.classifier.estimators.find((e) => e.base.type === "ExtraTreesClassifier").base;
    this.shapClasses = extraTrees.classes;
    this.expectedValue = explainer.expected_value;
    this.shapTrees = shapTrees(extraTrees, explainer.trees);
  }

  scale(xRaw) {
    return Float64Array.from(xRaw, (v, j) => (v - this.mean[j]) / this.scaleBy[j]);
  }

  /** One site: { oxidationState, probability, basePredictions, agreement }. */
  async predict(xRaw) {
    const x = this.scale(xRaw);
    const probas = await Promise.all(this.estimators.map((est) => est(x)));
    const ensemble = this.classes.map((_, c) => probas.reduce((s, p) => s + p[c], 0) / probas.length);
    const best = argmax(ensemble);
    const base = probas.map(argmax);
    return {
      oxidationState: this.classes[best],
      probability: ensemble[best],
      basePredictions: base.map((b) => this.classes[b]),
      agreement: (base.filter((b) => b === best).length / base.length) * 100,
    };
  }

  /** CSD refcodes of the k nearest training points, closest first, without duplicates. */
  async nearestTrainingStructures(xRaw, k = 4) {
    const nearest = await this.neighbours.nearest(this.scale(xRaw), k, "euclidean");
    return [...new Set(nearest.map((nb) => this.trainingNames[nb.i]))];
  }

  /**
   * SHAP values of one site for an oxidation state, or null if the explainer
   * has no output for it: { base_value, values }.
   */
  shap(xRaw, oxidationState, approximate) {
    const k = this.shapClasses.indexOf(oxidationState);
    if (k < 0) return null;
    const x32 = Float32Array.from(this.scale(xRaw));
    const phi = new Array(x32.length).fill(0);
    for (const t of this.shapTrees) (approximate ? saabas : treeShap)(t, x32, k, phi);
    return { base_value: this.expectedValue[k], values: phi };
  }

  /**
   * Percentile of each feature in the training set (scipy percentileofscore,
   * kind="rank", truncated), from the values where it changes.
   */
  percentiles(xRaw) {
    return Array.from(xRaw, (v, j) => {
      const { values, at, above } = this.percentileSteps[j];
      let lo = 0;
      let hi = values.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (values[mid] <= v) lo = mid + 1;
        else hi = mid;
      }
      if (lo === 0) return 0; // below every training value
      return values[lo - 1] === v ? at[lo - 1] : above[lo - 1];
    });
  }
}

/** shap's approximate=True (Saabas): value changes along the decision path. */
function saabas(t, x32, k, phi) {
  let node = 0;
  while (t.left[node] !== -1) {
    const f = t.feature[node];
    const next = x32[f] <= t.threshold[node] ? t.left[node] : t.right[node];
    phi[f] += t.value(next)[k] - t.value(node)[k];
    node = next;
  }
}

/**
 * shap's exact tree_path_dependent TreeSHAP (tree_shap_recursive in shap's
 * C++). The path is four parallel arrays: feature, zero and one fractions,
 * and weights.
 */
function treeShap(t, x32, k, phi) {
  const recurse = (node, parent, zero, one, feature) => {
    const path = { f: parent.f.slice(), z: parent.z.slice(), o: parent.o.slice(), w: parent.w.slice() };
    extend(path, zero, one, feature);
    if (t.left[node] === -1) {
      const v = t.value(node)[k];
      for (let i = 1; i < path.f.length; i++) phi[path.f[i]] += unwoundSum(path, i) * (path.o[i] - path.z[i]) * v;
      return;
    }
    const f = t.feature[node];
    const [hot, cold] = x32[f] <= t.threshold[node] ? [t.left[node], t.right[node]] : [t.right[node], t.left[node]];
    let inZero = 1;
    let inOne = 1;
    const seen = path.f.indexOf(f);
    if (seen >= 0) {
      inZero = path.z[seen];
      inOne = path.o[seen];
      unwind(path, seen);
    }
    recurse(hot, path, (t.cover[hot] / t.cover[node]) * inZero, inOne, f);
    recurse(cold, path, (t.cover[cold] / t.cover[node]) * inZero, 0, f);
  };
  recurse(0, { f: [], z: [], o: [], w: [] }, 1, 1, -1);
}

function extend({ f, z, o, w }, zero, one, feature) {
  const d = f.length;
  f.push(feature);
  z.push(zero);
  o.push(one);
  w.push(d === 0 ? 1 : 0);
  for (let i = d - 1; i >= 0; i--) {
    w[i + 1] += (one * w[i] * (i + 1)) / (d + 1);
    w[i] = (zero * w[i] * (d - i)) / (d + 1);
  }
}

function unwind({ f, z, o, w }, index) {
  const d = f.length - 1;
  const one = o[index];
  const zero = z[index];
  let next = w[d];
  for (let i = d - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = w[i];
      w[i] = (next * (d + 1)) / ((i + 1) * one);
      next = tmp - (w[i] * zero * (d - i)) / (d + 1);
    } else {
      w[i] = (w[i] * (d + 1)) / (zero * (d - i));
    }
  }
  // the weights stay where they are; the rest shifts down
  for (const a of [f, z, o]) a.splice(index, 1);
  w.pop();
}

function unwoundSum({ z, o, w }, index) {
  const d = w.length - 1;
  const one = o[index];
  const zero = z[index];
  let next = w[d];
  let total = 0;
  for (let i = d - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = next / ((i + 1) * one);
      total += tmp;
      next = w[i] - tmp * zero * (d - i);
    } else {
      total += w[i] / (zero * (d - i));
    }
  }
  return total * (d + 1);
}
