// The 49 "crystal_nn_no_steinhardt" features of a site: matminer's
// CrystalNNFingerprint.from_preset("ops") without the q2/q4/q6 columns.
// Ports pymatgen's CrystalNN.get_nn_data (as oximachine calls it: no
// oxidation states, so covalent radii) and the order parameters of
// LocalStructOrderParams.get_order_parameters that these features use.

// TODO: decide if this should be bubbled up to matsci?

import { dot, norm, scale, sub } from "./linalg.js";
import { normalize } from "matsci-parse/matrix";
import { COVALENT_RADIUS, ELECTRONEGATIVITY } from "./elementalData.js";
import { voronoiNeighbours } from "./voronoi.js";

// CrystalNN defaults
const X_DIFF_WEIGHT = 3.0;
const DISTANCE_CUTOFFS = [0.5, 1.0];

// pymatgen DEFAULT_OP_PARAMS of the types used
const SOUTH_POLE_ANGLE = 2.356194490192345; // 3π/4
const DEFAULTS = {
  tri_plan_max: { IGW_TA: 17.5, TA: 0.66666666667, fac_AA: 1, exp_cos_AA: 2 },
  tet_max: { IGW_TA: 18.5, TA: 0.6081734479693927, fac_AA: 1.5, exp_cos_AA: 2 },
  T: { IGW_EP: 15.5, fac_AA: 1, exp_cos_AA: 2 },
  sq_plan_max: {
    min_SPP: SOUTH_POLE_ANGLE,
    IGW_SPP: 13.5,
    IGW_EP: 17.7,
    w_SPP: 1,
    fac_AA: 1,
    exp_cos_AA: 2,
  },
  see_saw_rect: {
    min_SPP: SOUTH_POLE_ANGLE,
    IGW_SPP: 11.5,
    IGW_EP: 27,
    fac_AA: 2,
    exp_cos_AA: 2,
  },
  tri_bipyr: {
    min_SPP: SOUTH_POLE_ANGLE,
    IGW_SPP: 12,
    IGW_EP: 16.6,
    fac_AA: 1.5,
    exp_cos_AA: 2,
    w_SPP: 1,
  },
  tri_pyr: { IGW_EP: 15.5, fac_AA: 1.5, exp_cos_AA: 2 },
  pent_plan_max: { TA: 0.6, IGW_TA: 19.333 },
  sq_pyr: { IGW_EP: 14.9, fac_AA: 2, exp_cos_AA: 2 },
  oct_max: {
    min_SPP: SOUTH_POLE_ANGLE,
    IGW_SPP: 15,
    IGW_EP: 18,
    w_SPP: 1,
    fac_AA: 2,
    exp_cos_AA: 2,
  },
  hex_plan_max: {
    min_SPP: 2.6179938779914944,
    IGW_SPP: 7.5,
    w_SPP: 1,
    fac_AA: 1,
    exp_cos_AA: 2,
    IGW_TA: 25,
    TA: 0.16666667,
  },
  pent_pyr: { IGW_EP: 13.8, fac_AA: 2.5, exp_cos_AA: 2 },
  hex_pyr: { IGW_EP: 12.5, fac_AA: 3, exp_cos_AA: 2 },
  pent_bipyr: {
    min_SPP: SOUTH_POLE_ANGLE,
    IGW_SPP: 12.5,
    IGW_EP: 14.75,
    fac_AA: 2.5,
    exp_cos_AA: 2,
    w_SPP: 1,
  },
  bcc: { min_SPP: 2.5261129449194057, IGW_SPP: 15, w_SPP: 6 },
  hex_bipyr: {
    min_SPP: SOUTH_POLE_ANGLE,
    IGW_SPP: 14.1,
    IGW_EP: 13.6,
    fac_AA: 3,
    exp_cos_AA: 2,
    w_SPP: 1,
  },
  cuboct_max: {
    min_SPP: 2.792526803190927,
    IGW_SPP: 28.75,
    w_SPP: 1.8,
    // pymatgen's unnamed cuboct parameters: the equatorial band (75°-105°)
    // and the Gaussian widths in and outside it
    max_EQ: 1.8325957145940461,
    min_EQ: 1.3089969389957472,
    IGW_EQ: 25.5,
    IGW_RING: 31.25,
  },
};
const op = (type, params = DEFAULTS[type]) => ({ type, params });

// The columns after each CN's "wt" (matminer's cn_target_motif_op with
// cn_motif_op_params); the other CNs only have "wt".
const CN_OPS = {
  1: [op("sgl_bd")],
  2: [
    op("bent", { TA: 0.5, IGW_TA: 15.15 }), // L-shaped
    op("bent", { TA: 0.5802777777777778, IGW_TA: 13.95 }), // water-like
    op("bent", { TA: 0.666666666667, IGW_TA: 13.25 }), // bent 120 degrees
    op("bent", { TA: 0.833333333333333, IGW_TA: 12.45 }), // bent 150 degrees
    op("bent", { TA: 1, IGW_TA: 8.667 }), // linear
  ],
  3: [
    op("tri_plan_max"),
    op("tet_max", {
      TA: 0.6081734479693927,
      IGW_TA: 18.33,
      fac_AA: 1.5,
      exp_cos_AA: 2,
    }), // trigonal non-coplanar
    op("T"),
  ],
  4: [
    op("sq_plan_max"),
    op("tet_max"),
    op("see_saw_rect"),
    op("tri_bipyr", {
      min_SPP: SOUTH_POLE_ANGLE,
      IGW_EP: 15.75,
      IGW_SPP: 12.75,
      fac_AA: 1.5,
      exp_cos_AA: 2,
      w_SPP: 1,
    }), // see-saw-like
    op("tri_pyr"),
  ],
  5: [op("pent_plan_max"), op("sq_pyr"), op("tri_bipyr")],
  6: [op("hex_plan_max"), op("oct_max"), op("pent_pyr")],
  7: [op("hex_pyr"), op("pent_bipyr")],
  8: [op("bcc"), op("hex_bipyr")],
  12: [op("cuboct_max")],
};
const MAX_CN = 24;

/** pymatgen CrystalNN._semicircle_integral */
function semicircleIntegral(bins, i) {
  const area = (x) =>
    0.5 * (x * Math.sqrt(1 - x * x) + Math.atan(x / Math.sqrt(1 - x * x)));
  const a1 = bins[i] === 1 ? 0.25 * Math.PI : area(bins[i]);
  return (a1 - area(bins[i + 1])) / (0.25 * Math.PI);
}

const EMPTY_RESULT = { cnWeights: { 0: 1 }, cnNeighbours: { 0: [] } };

/**
 * CrystalNN.get_nn_data of a site: { cnWeights: {cn: weight},
 * cnNeighbours: {cn: [vector from the site to each neighbour]} }.
 */
function crystalNN(structure, siteIndex) {
  const symbol = (i) => structure.sites[i].species.symbol;
  const me = symbol(siteIndex);

  const faces = voronoiNeighbours(structure, siteIndex);
  const maxSolidAngle = Math.max(...faces.map((f) => f.solidAngle));
  let nn = faces.map((f) => {
    // VoronoiNN(weight="solid_angle"), porous adjustment, electronegativity difference
    let weight = (f.solidAngle / maxSolidAngle) * (f.solidAngle / f.area);
    const dX = Math.abs(
      ELECTRONEGATIVITY[me] - ELECTRONEGATIVITY[symbol(f.siteIndex)],
    );
    if (!Number.isNaN(dX)) weight *= 1 + X_DIFF_WEIGHT * Math.sqrt(dX / 3.3);
    return { rel: f.rel, dist: f.dist, symbol: symbol(f.siteIndex), weight };
  });
  nn.sort((a, b) => b.weight - a.weight);
  if (!nn.length || nn[0].weight === 0) return EMPTY_RESULT;
  const highest = nn[0].weight;

  for (const e of nn) {
    e.weight /= highest;
    // No oxidation states on the sites, so pymatgen uses covalent radii
    const diameter = COVALENT_RADIUS[me] + COVALENT_RADIUS[e.symbol];
    const low = diameter + DISTANCE_CUTOFFS[0];
    const high = diameter + DISTANCE_CUTOFFS[1];
    if (e.dist >= high) e.weight = 0;
    else if (e.dist > low)
      e.weight *=
        (Math.cos(((e.dist - low) / (high - low)) * Math.PI) + 1) * 0.5;
  }
  nn.sort((a, b) => b.weight - a.weight);
  if (nn[0].weight === 0) return EMPTY_RESULT;

  for (const e of nn) e.weight = Number(e.weight.toFixed(3));
  nn = nn.filter((e) => e.weight > 0);
  const bins = [...new Set(nn.map((e) => e.weight)), 0];

  const cnWeights = {};
  const cnNeighbours = {};
  bins.forEach((w, i) => {
    if (w === 0) return;
    const shell = nn.filter((e) => e.weight >= w);
    cnNeighbours[shell.length] = shell.map((e) => e.rel);
    cnWeights[shell.length] = semicircleIntegral(bins, i);
  });
  const cn0 = 1 - Object.values(cnWeights).reduce((a, b) => a + b, 0);
  if (cn0 > 0) {
    cnWeights[0] = cn0;
    cnNeighbours[0] = [];
  }
  return { cnWeights, cnNeighbours };
}

// Types with a south-pole (thetam >= min_SPP) term
const BIPYRAMIDS = new Set([
  "see_saw_rect",
  "tri_bipyr",
  "pent_bipyr",
  "hex_bipyr",
  "oct_max",
  "sq_plan_max",
  "hex_plan_max",
]);
const PYRAMIDS = new Set(["T", "tri_pyr", "sq_pyr", "pent_pyr", "hex_pyr"]);
const gauss = (x) => Math.exp(-0.5 * x * x);
const acos = (x) => Math.acos(Math.max(-1, Math.min(x, 1)));
const sum = (a) => a.reduce((s, v) => s + v, 0);
const normalizeAngle = (theta) => theta / Math.PI;

/**
 * One order parameter of a site whose neighbours are at vectors `rij`
 * (pymatgen LocalStructOrderParams([type], [params])), or null when
 * undefined. Every neighbour j in turn is the north pole, every other
 * neighbour k fixes the prime meridian, and the others m are scored.
 */
function orderParameter({ type, params: p }, rij) {
  const n = rij.length;
  const dist = rij.map(norm);
  if (type === "sgl_bd") {
    const d = [...dist].sort((a, b) => a - b);
    return n === 1 ? 1 : 1 - d[0] / d[1];
  }
  const unit = rij.map((r, j) => scale(r, 1 / dist[j]));
  const qsp = []; // qsp[j][kc] and its norm
  const norms = [];

  for (let j = 0; j < n; j++) {
    const z = unit[j];
    // per neighbour: polar angle, and unit vector perpendicular to z (pymatgen
    // gramschmidt; null when parallel)
    const theta = unit.map((u) => acos(dot(z, u)));
    const perp = unit.map((u) => {
      const v = sub(u, scale(z, dot(u, z)));
      return norm(v) < 1e-12 ? null : normalize(v); // normalize throws below 1e-12
    });
    qsp.push([]);
    norms.push([]);
    for (let k = 0; k < n; k++) {
      if (k === j) continue;
      let q = 0;
      let w = 0;
      const thetak = theta[k];
      const x = perp[k];

      if (type === "bent" || type === "tri_plan_max" || type === "tet_max") {
        q += gauss(p.IGW_TA * (normalizeAngle(thetak) - p.TA));
        w += 1;
      } else if (PYRAMIDS.has(type)) {
        q += gauss(p.IGW_EP * (normalizeAngle(thetak) - 0.5));
        w += 1;
      } else if (type === "cuboct_max") {
        if (thetak >= p.min_SPP) {
          q += p.w_SPP * gauss(p.IGW_SPP * (normalizeAngle(thetak) - 1));
          w += p.w_SPP;
        }
      } else if (BIPYRAMIDS.has(type)) {
        if (thetak < p.min_SPP) {
          q += gauss(
            type === "hex_plan_max"
              ? p.IGW_TA * (Math.abs(normalizeAngle(thetak) - 0.5) - p.TA)
              : p.IGW_EP * (normalizeAngle(thetak) - 0.5),
          );
          w += 1;
        }
      } else if (type === "pent_plan_max") {
        q += gauss(
          p.IGW_TA *
            (normalizeAngle(thetak) - (thetak <= p.TA * Math.PI ? 0.4 : 0.8)),
        );
        w += 1;
      } else if (type === "bcc" && j < k && thetak >= p.min_SPP) {
        q += p.w_SPP * gauss(p.IGW_SPP * (normalizeAngle(thetak) - 1));
        w += p.w_SPP;
      }

      for (let m = 0; m < n && x; m++) {
        if (m === j || m === k) continue;
        const thetam = theta[m];
        const x2 = perp[m];
        const phi = x2 ? acos(dot(x2, x)) : 0;

        if (BIPYRAMIDS.has(type) && thetam >= p.min_SPP) {
          q += gauss(p.IGW_SPP * (normalizeAngle(thetam) - 1));
          w += 1;
        }
        if (!x2) continue;
        const cosAA = Math.cos(p.fac_AA * phi) ** p.exp_cos_AA;
        if (type === "tri_plan_max" || type === "tet_max") {
          q += gauss(p.IGW_TA * (normalizeAngle(thetam) - p.TA)) * cosAA;
          w += 1;
        } else if (type === "pent_plan_max") {
          q +=
            gauss(
              p.IGW_TA *
                (normalizeAngle(thetam) -
                  (thetam <= p.TA * Math.PI ? 0.4 : 0.8)),
            ) *
            Math.cos(phi) ** 2;
          w += 1;
        } else if (PYRAMIDS.has(type)) {
          q += cosAA * gauss(p.IGW_EP * (normalizeAngle(thetam) - 0.5));
          w += 1;
        } else if (type === "see_saw_rect") {
          if (
            thetam < p.min_SPP &&
            thetak < p.min_SPP &&
            phi < 0.75 * Math.PI
          ) {
            q += cosAA * gauss(p.IGW_EP * (normalizeAngle(thetam) - 0.5));
            w += 1;
          }
        } else if (BIPYRAMIDS.has(type)) {
          if (thetam < p.min_SPP && thetak < p.min_SPP) {
            q +=
              cosAA *
              gauss(
                type === "hex_plan_max"
                  ? p.IGW_TA * (Math.abs(normalizeAngle(thetam) - 0.5) - p.TA)
                  : p.IGW_EP * (normalizeAngle(thetam) - 0.5),
              );
            w += 1;
          }
        } else if (type === "bcc" && j < k) {
          if (thetak < p.min_SPP) {
            const fac = thetak > Math.PI / 2 ? 1 : -1;
            const s = (thetam - Math.PI / 2) / Math.asin(1 / 3);
            q += fac * Math.cos(3 * phi) * (1 / Math.exp(-0.5)) * s * gauss(s);
            w += 1;
          }
        } else if (type === "cuboct_max") {
          if (thetam < p.min_SPP && p.min_EQ < thetak && thetak < p.max_EQ) {
            const azimuth = gauss(
              0.0556 * (Math.cos(phi - 0.5 * Math.PI) - 0.81649658),
            );
            if (p.min_EQ < thetam && thetam < p.max_EQ) {
              q +=
                Math.cos(phi) ** 2 *
                gauss(p.IGW_EQ * (normalizeAngle(thetam) - 0.5));
              w += 1;
            } else if (thetam < p.min_EQ) {
              q +=
                azimuth * gauss(p.IGW_RING * (normalizeAngle(thetam) - 1 / 3));
              w += 1;
            } else if (thetam > p.max_EQ) {
              q +=
                azimuth * gauss(p.IGW_RING * (normalizeAngle(thetam) - 2 / 3));
              w += 1;
            }
          }
        }
      }
      qsp[j].push(q);
      norms[j].push(w);
    }
  }

  if (type === "bent") {
    const total = sum(norms.flat());
    return total > 1e-12 ? sum(qsp.flat()) / total : null;
  }
  if (type === "bcc") {
    return n > 3 ? sum(qsp.flat()) / (0.5 * n * (6 + (n - 2) * (n - 3))) : null;
  }
  // The others: the best north pole and meridian
  if (n <= 1) return null;
  return Math.max(
    ...qsp.flatMap((row, j) =>
      row.map((q, kc) => (norms[j][kc] > 1e-12 ? q / norms[j][kc] : 0)),
    ),
  );
}

/** The 49 features of a site, in the model's order (CN 1-24). */
export function crystalNNFingerprint(structure, siteIndex) {
  const { cnWeights, cnNeighbours } = crystalNN(structure, siteIndex);
  const out = [];
  for (let cn = 1; cn <= MAX_CN; cn++) {
    const wt = cnWeights[cn] ?? 0;
    out.push(wt);
    for (const o of CN_OPS[cn] ?? []) {
      out.push(wt === 0 ? 0 : wt * (orderParameter(o, cnNeighbours[cn]) ?? 0));
    }
  }
  return out;
}
