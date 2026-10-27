"""The rebuilt model reproduces the legacy scikit-learn 0.22 / shap 0.35 objects.

Reference outputs were computed by the legacy objects themselves
(legacy/export_model.py); the 72 precomputed results are an independent
end-to-end check from the old web service.
"""

import json

import numpy as np
import pytest

from .conftest import PRECOMPUTED, REFERENCE, ROMAN, needs_model

pytestmark = needs_model


@pytest.fixture(scope="module")
def ref():
    if not REFERENCE.exists():
        pytest.skip("reference outputs missing: run legacy/export_model.py (see its docstring)")
    data = np.load(REFERENCE, allow_pickle=False)
    return {k: data[k] for k in data.files}


def test_scaler(model, ref):
    np.testing.assert_allclose(model.scale(ref["x_raw"]), ref["x_scaled"], rtol=0, atol=1e-12)


@pytest.mark.parametrize("i", range(4))
def test_calibrated_estimators(model, ref, i):
    est = model.estimators[i]
    proba = est.predict_proba(ref["x_scaled"])
    np.testing.assert_allclose(proba, ref["estimator_proba"][i], rtol=0, atol=1e-9, err_msg=est.name)


def test_ensemble(model, ref):
    preds = model.predict(ref["x_raw"])
    np.testing.assert_array_equal(preds.oxidation_state, ref["prediction"])
    np.testing.assert_allclose(preds.probability, ref["proba"].max(axis=1), rtol=0, atol=1e-9)
    np.testing.assert_array_equal(preds.base_predictions, model.classes[ref["base_predictions"]])


def test_nearest_training_structures(model, ref):
    _, idx = model.kdtree.query(ref["x_scaled"][:200], k=4)
    np.testing.assert_array_equal(np.sort(idx, axis=1), np.sort(ref["kd_neighbors"], axis=1))


@pytest.mark.parametrize("approximate,key,n", [(True, "shap_approx", 200), (False, "shap_exact", 20)])
def test_shap(model, ref, approximate, key, n):
    values = model.explainer.shap_values(ref["x_scaled"][:n], approximate=approximate)
    np.testing.assert_allclose(values, ref[key], rtol=0, atol=1e-6)


@pytest.mark.parametrize("path", sorted(PRECOMPUTED.glob("*.json")), ids=lambda p: p.stem)
def test_precomputed_predictions(model, path):
    """Predictions of the old web service, from its stored feature matrices."""
    legacy = json.loads(path.read_text())
    preds = model.predict(np.asarray(legacy["feature_array"]))
    for i, (_label, state, proba, base, agreement, _bar) in enumerate(legacy["predictions_output"]):
        assert preds.oxidation_state[i] == ROMAN[state]
        assert preds.probability[i] == pytest.approx(proba, abs=1e-9)
        assert [int(p) for p in preds.base_predictions[i]] == [ROMAN[b] for b in base.split(", ")]
        assert preds.agreement[i] == pytest.approx(agreement)
