import json
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
GOLDEN = ROOT / "tests" / "golden"
PRECOMPUTED = GOLDEN / "precomputed"
STRUCTURES = GOLDEN / "structures"  # inputs of the legacy precomputed results
EXAMPLES = ROOT.parent / "frontend" / "public" / "examples"
MODEL_DATA = ROOT / "oximachine_api" / "model_data"
TRAINING_FEATURES = MODEL_DATA / "training_features.npy"
REFERENCE = GOLDEN / "model_reference.npz"

# Legacy results store oxidation states as Unicode Roman numerals.
ROMAN = {c: i for i, c in enumerate("ⅠⅡⅢⅣⅤⅥⅦⅧ", start=1)}

needs_model = pytest.mark.skipif(
    not (MODEL_DATA / "model.json").exists(),
    reason="model_data not exported yet: run legacy/export_model.py (see its docstring)",
)


def golden(name: str) -> dict:
    return json.loads((PRECOMPUTED / f"{name}.json").read_text())


@pytest.fixture(scope="session")
def model():
    from oximachine_api.model import OximachineModel

    return OximachineModel(MODEL_DATA)
