"""Featurize the precomputed structures with the current stack and compare to
the feature matrices the legacy pipeline produced.

Usage:
    python legacy/compare_features.py tests/golden/structures tests/golden/precomputed [NAME ...]
"""

import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
from pymatgen.io.cif import CifParser

from oximachine_api.features import FEATURESET, featurize_structure

warnings.simplefilter("ignore")


def load(cif: Path):
    return CifParser(str(cif), occupancy_tolerance=100).parse_structures(primitive=False)[0]


def main(structures: Path, golden: Path, names: list[str]) -> int:
    names = names or sorted(p.stem for p in golden.glob("*.json"))
    worst = 0.0
    for name in names:
        ref = json.loads((golden / f"{name}.json").read_text())
        x_ref = np.asarray(ref["feature_array"], dtype=float)
        t0 = time.time()
        try:
            x_new, _, metals = featurize_structure(load(structures / f"{name}.cif"))
        except Exception as exc:  # noqa: BLE001
            print(f"{name:12} FAILED: {exc}")
            continue
        dt = time.time() - t0
        if x_new.shape != x_ref.shape:
            print(f"{name:12} shape {x_new.shape} vs legacy {x_ref.shape} ({dt:.1f}s)")
            continue
        diff = np.abs(x_new - x_ref)
        worst = max(worst, diff.max())
        cols = np.where(diff.max(axis=0) > 1e-6)[0]
        print(
            f"{name:12} sites={len(metals):3d} max|Δ|={diff.max():.2e} "
            f"columns differing={len(cols)} ({dt:.1f}s)"
        )
    print(f"worst max|Δ| = {worst:.3e} over {len(FEATURESET)} feature groups")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]))
