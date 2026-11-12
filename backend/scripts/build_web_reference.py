"""Reference outputs of the Python model for the browser app's tests
(frontend/tests/reference.json.gz): for the feature matrices of the 72
legacy precomputed results, every site's prediction, nearest training
structures, SHAP values (approximate and exact) and percentiles.

    uv run python scripts/build_web_reference.py
"""

import gzip
import json
from pathlib import Path

import numpy as np

from oximachine_api.features import percentiles
from oximachine_api.model import OximachineModel

ROOT = Path(__file__).parents[2]
PRECOMPUTED = ROOT / "backend" / "tests" / "golden" / "precomputed"
OUT = ROOT / "frontend" / "tests" / "reference.json.gz"


def main() -> None:
    model = OximachineModel()
    out = {}
    for path in sorted(PRECOMPUTED.glob("*.json")):
        x = np.asarray(json.loads(path.read_text())["feature_array"])
        preds = model.predict(x)
        scaled = model.scale(x)
        shap = {a: model.explainer.shap_values(scaled, approximate=a) for a in (True, False)}
        pct = percentiles(x, model.training_features_path)
        sites = []
        for i, state in enumerate(preds.oxidation_state):
            k = model.explainer.output_index(int(state))
            sites.append(
                {
                    "x": x[i].tolist(),
                    "oxidation_state": int(state),
                    "probability": float(preds.probability[i]),
                    "base_model_predictions": [int(p) for p in preds.base_predictions[i]],
                    "agreement": float(preds.agreement[i]),
                    "nearest_training_structures": model.nearest_training_structures(x[i : i + 1])[0],
                    "shap_base_value": None if k is None else float(model.explainer.expected_value[k]),
                    "shap_approximate": None if k is None else shap[True][k, i].tolist(),
                    "shap_exact": None if k is None else shap[False][k, i].tolist(),
                    "percentiles": pct[i].tolist(),
                }
            )
        out[path.stem] = sites
    OUT.write_bytes(gzip.compress(json.dumps(out).encode(), mtime=0))
    print(f"{sum(map(len, out.values()))} sites -> {OUT}")


if __name__ == "__main__":
    main()
