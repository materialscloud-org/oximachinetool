"""Write the model for the browser app (frontend/public/model/) from the
version-independent export in oximachine_api/model_data/.

    uv run python scripts/build_web_model.py [OUT_DIR]

Output, read by frontend/src/OxiMachine/model.js:

- manifest.json: the model.json / explainer.json manifests, where every array
  name is replaced by {"offset", "shape", "dtype"} into one binary blob;
- model.bin.gz: that blob, gzipped;
- rows/*.bin.gz: the nearest-neighbour data (47 951 training points, 116
  features, float64), CHUNK_ROWS rows per file, fetched only when needed.

Everything the app computes stays exactly as in the Python model; what
changes is what it downloads (27.5 MB -> about 4.8 MB up front):

- Nearest neighbours (the kNN estimator, L1, and the nearest training
  structures, L2) are exact searches over the training points in order of a
  lower bound of their distance, computed from a coarse copy: each feature of
  each point as one of BINS quantile bins, with the bin's smallest and largest
  value. Only the points whose bound does not exclude them are fetched (their
  chunk files), and their exact distances decide. Points close in feature
  space share chunk files (ordered by k-means cluster), so a query fetches few.
- Percentiles: per feature, only the training values where the percentile of
  a value changes (it is a step function of the sorted training features).
- The SHAP explainer's trees are the extra trees with values v / w / n (w the
  node's sample weight, n the number of trees); shap computed them in another
  order, so the build stores the difference in units in the last place.
- The kNN estimator's training points are indices into the neighbour data.
"""

import gzip
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from sklearn.cluster import MiniBatchKMeans

from oximachine_api.features import display_name, feature_category, feature_names
from oximachine_api.model import DATA_DIR, OximachineModel

ROOT = Path(__file__).parents[2]
BINS = 64  # coarse copy: 6 bits per feature
CHUNK_ROWS = 512


class Blob:
    def __init__(self):
        self.chunks: list[bytes] = []
        self.size = 0

    def add(self, array: np.ndarray) -> dict:
        array = np.ascontiguousarray(array)
        if array.dtype.kind == "f":
            array = array.astype("<f8")
        elif array.dtype in (np.uint8, np.int8):
            pass
        elif array.dtype.kind in "iub":
            assert np.abs(array).max(initial=0) < 2**31, "int32 overflow"
            array = array.astype("<i4")
        else:
            raise TypeError(array.dtype)
        ref = {"offset": self.size, "shape": list(array.shape), "dtype": array.dtype.name}
        data = array.tobytes()
        data += b"\0" * (-len(data) % 8)  # keep every array 8-byte aligned
        self.chunks.append(data)
        self.size += len(data)
        return ref


def resolve(spec, arrays: dict, blob: Blob):
    """Replace every array name in a manifest by its reference in the blob."""
    if isinstance(spec, dict):
        return {k: resolve(v, arrays, blob) for k, v in spec.items()}
    if isinstance(spec, list):
        return [resolve(v, arrays, blob) for v in spec]
    if isinstance(spec, str) and spec in arrays:
        return blob.add(arrays[spec])
    return spec


def coarse(data: np.ndarray):
    """Per feature: the bin of every point (column-major), and each bin's
    smallest and largest value (exact values when a feature has few)."""
    n, m = data.shape
    codes = np.empty((m, n), np.uint8)
    lo, hi = np.zeros((m, BINS)), np.zeros((m, BINS))
    for j in range(m):
        col = data[:, j]
        values = np.unique(col)
        if len(values) <= BINS:
            codes[j] = np.searchsorted(values, col)
        else:
            edges = np.quantile(col, np.linspace(0, 1, BINS + 1))
            codes[j] = np.clip(np.searchsorted(edges, col, side="right") - 1, 0, BINS - 1)
        for b in range(BINS):
            members = col[codes[j] == b]
            if len(members):
                lo[j, b], hi[j, b] = members.min(), members.max()
        assert np.all(lo[j, codes[j]] <= col) and np.all(col <= hi[j, codes[j]])
    return codes, lo, hi


def percentile_steps(training: np.ndarray):
    """Per feature: the values where the percentile changes, the percentile at
    each value and just above it (features.percentiles, scipy's
    percentileofscore kind="rank", truncated). Below the first value it is 0."""
    n = len(training)
    steps = []
    for col in training.T:
        values, counts = np.unique(col, return_counts=True)
        right = np.cumsum(counts)  # training values <= v
        left = right - counts  # < v
        at = ((left + right + 1) * 50.0 / n).astype(int)
        above = ((2 * right) * 50.0 / n).astype(int)
        keep, previous = [], 0
        for i in range(len(values)):
            if at[i] != previous or above[i] != previous:
                keep.append(i)
                previous = above[i]
        keep = np.array(keep, dtype=int)
        steps.append((values[keep], at[keep].astype(np.uint8), above[keep].astype(np.uint8)))
    return steps


def main(out: Path) -> None:
    model_json = json.loads((DATA_DIR / "model.json").read_text())
    explainer_json = json.loads((DATA_DIR / "explainer.json").read_text())
    arrays = dict(np.load(DATA_DIR / "model.npz", allow_pickle=False))
    explainer_arrays = dict(np.load(DATA_DIR / "explainer.npz", allow_pickle=False))
    training = np.load(DATA_DIR / "training_features.npy", allow_pickle=False)

    # The kNN training points, as indices into the neighbour data
    kd = arrays.pop(model_json["neighbors"]["data"])
    row_index = {row.tobytes(): i for i, row in enumerate(kd)}
    for est in model_json["classifier"]["estimators"]:
        base = est["base"]
        if base["type"] == "KNeighborsClassifier":
            fit_x = arrays.pop(base.pop("fit_X"))
            base["fit_rows"] = "knn_fit_rows"
            arrays["knn_fit_rows"] = np.array([row_index[row.tobytes()] for row in fit_x])
            assert np.array_equal(kd[arrays["knn_fit_rows"]], fit_x)
        if base["type"] == "ExtraTreesClassifier":
            extra_trees = base

    # The explainer's trees from the extra trees
    n_trees = len(extra_trees["trees"])
    shap_trees = []
    for t, s in zip(extra_trees["trees"], explainer_json["trees"], strict=True):
        left, right, feature, threshold, value = (arrays[t[k]] for k in ("children_left", "children_right", "feature", "threshold", "value"))
        leaf = left == -1
        assert np.array_equal(left, explainer_arrays[s["children_left"]])
        assert np.array_equal(right, explainer_arrays[s["children_right"]])
        assert np.array_equal(left, explainer_arrays[s["children_default"]])
        assert np.array_equal(feature[~leaf], explainer_arrays[s["features"]][~leaf])
        assert np.array_equal(threshold[~leaf], explainer_arrays[s["thresholds"]][~leaf])
        weight = explainer_arrays[s["node_sample_weight"]]
        values = explainer_arrays[s["values"]]
        computed = value[:, 0, : values.shape[1]] / weight[:, None] / n_trees
        assert np.all(values >= 0) and np.all(computed >= 0)
        ulps = values.view(np.int64) - computed.view(np.int64)
        assert np.abs(ulps).max() < 128
        shap_trees.append({"node_sample_weight": weight, "value_ulps": ulps.astype(np.int8)})

    # Coarse copy, chunks in k-means order
    clusters = MiniBatchKMeans(len(kd) // CHUNK_ROWS, random_state=0, n_init=3, batch_size=4096).fit(kd).labels_
    order = np.argsort(clusters, kind="stable")  # position -> training point
    codes, lo, hi = coarse(kd)

    blob = Blob()
    names = feature_names()
    model_json["neighbors"]["data"] = {
        "rows": len(kd),
        "chunk_rows": CHUNK_ROWS,
        "order": blob.add(order),
        "codes": blob.add(codes),
        "bin_lo": blob.add(lo),
        "bin_hi": blob.add(hi),
    }
    explainer = {k: v for k, v in explainer_json.items() if k != "trees"}
    manifest = {
        "model_version": OximachineModel(DATA_DIR).version,
        "feature_names": [display_name(n) for n in names],
        "feature_categories": [feature_category(n) for n in names],
        "model": resolve(model_json, arrays, blob),
        "explainer": {
            **resolve(explainer, explainer_arrays, blob),
            "trees": [{k: blob.add(v) for k, v in t.items()} for t in shap_trees],
        },
        "training_names": json.loads((DATA_DIR / model_json["neighbors"]["names_file"]).read_text()),
        "percentiles": [
            {"values": blob.add(v), "at": blob.add(a), "above": blob.add(b)} for v, a, b in percentile_steps(training)
        ],
    }

    packed = gzip.compress(b"".join(blob.chunks), compresslevel=9, mtime=0)
    if out.exists():
        shutil.rmtree(out)
    (out / "rows").mkdir(parents=True)
    (out / "model.bin.gz").write_bytes(packed)
    (out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))

    rows = kd[order].astype("<f8")
    chunk_bytes = 0
    for c in range(0, len(rows), CHUNK_ROWS):
        data = gzip.compress(rows[c : c + CHUNK_ROWS].tobytes(), compresslevel=9, mtime=0)
        (out / "rows" / f"{c // CHUNK_ROWS}.bin.gz").write_bytes(data)
        chunk_bytes += len(data)
    print(
        f"up front: {(len(packed) + (out / 'manifest.json').stat().st_size) / 1e6:.1f} MB "
        f"(model.bin.gz + manifest.json); rows: {-(-len(rows) // CHUNK_ROWS)} files, "
        f"{chunk_bytes / 1e6:.1f} MB in all, fetched as needed; {out}"
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "frontend" / "public" / "model")
