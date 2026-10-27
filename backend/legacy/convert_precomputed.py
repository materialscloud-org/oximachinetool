"""Convert the legacy precomputed results to JSON (already done: the output is
tests/golden/precomputed/). The pickles lived in
webservice/compute/precomputed/precomputed/ of the removed Flask app; restore
them from git history (commit 0c46b5f) to re-run this.

These pickles only hold plain data (dicts, lists, numpy arrays and scalars),
so they are read with a restricted unpickler that refuses every class except
numpy's array/scalar reconstructors: no library code runs while loading.

Usage:
    python legacy/convert_precomputed.py <precomputed_dir> <out_dir>
"""

import json
import pickle
import sys
from pathlib import Path

import numpy as np

ALLOWED = {
    ("numpy.core.multiarray", "_reconstruct"),
    ("numpy.core.multiarray", "scalar"),
    ("numpy", "ndarray"),
    ("numpy", "dtype"),
}


class DataOnlyUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) not in ALLOWED:
            raise pickle.UnpicklingError(f"refusing to load {module}.{name}")
        # numpy 2 keeps numpy.core.* importable for exactly this purpose.
        return super().find_class(module, name)


def to_jsonable(obj):
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.generic):
        return obj.item()
    return obj


def main(src: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.glob("*.pkl")):
        if " " in path.stem:  # stray "X copy.pkl" duplicates in the repo
            continue
        with path.open("rb") as fh:
            data = DataOnlyUnpickler(fh).load()
        (out / f"{path.stem}.json").write_text(json.dumps(to_jsonable(data)))
    print(f"converted {len(list(out.glob('*.json')))} files into {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
