"""Check that oximachine_api.voronoi (and the featurizer cache in features.py)
do not change the features: featurize each structure with pymatgen's original
VoronoiNN.get_voronoi_polyhedra and with the replacement, in the same process,
and compare the matrices.

Usage:
    python legacy/compare_voronoi.py STRUCTURES_DIR [NAME ...]   (CIF files)
"""

import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from pymatgen.core.local_env import VoronoiNN
from pymatgen.io.cif import CifParser

from oximachine_api import voronoi
from oximachine_api.features import featurize_structure

warnings.simplefilter("ignore")


def run(path: Path):
    s = CifParser(str(path), occupancy_tolerance=100).parse_structures(primitive=False)[0]
    out = {}
    for label, method in [("original", voronoi._original), ("fast", voronoi.get_voronoi_polyhedra)]:
        VoronoiNN.get_voronoi_polyhedra = method
        t0 = time.time()
        try:
            out[label] = (featurize_structure(s)[0], time.time() - t0)
        except Exception as exc:  # noqa: BLE001
            out[label] = (f"{type(exc).__name__}: {exc}", time.time() - t0)
    voronoi.install()
    (a, ta), (b, tb) = out["original"], out["fast"]
    if isinstance(a, str) or isinstance(b, str):
        same = a == b
        return path.stem, same, f"original: {a if isinstance(a, str) else 'ok'} / fast: {b if isinstance(b, str) else 'ok'}", ta, tb
    d = float(np.max(np.abs(a - b))) if a.shape == b.shape else float("inf")
    return path.stem, d <= 1e-9, f"max|Δ|={d:.2e}", ta, tb


def main(directory: Path, names: list[str]) -> int:
    paths = [directory / f"{n}.cif" for n in names] if names else sorted(directory.glob("*.cif"))
    with Pool() as pool:
        results = pool.map(run, paths, chunksize=1)
    bad = 0
    for name, ok, detail, ta, tb in results:
        bad += not ok
        print(f"{name:16} {'same' if ok else 'DIFFERENT'} {detail}  {ta:6.1f}s -> {tb:5.1f}s")
    total_a, total_b = sum(r[3] for r in results), sum(r[4] for r in results)
    print(f"{len(results) - bad}/{len(results)} identical (1e-9); featurization {total_a:.0f}s -> {total_b:.0f}s")
    return int(bad > 0)


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]), sys.argv[2:]))
