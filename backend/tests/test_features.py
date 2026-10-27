"""The featurizer on the current stack reproduces the legacy feature matrices."""

import warnings

import numpy as np
import pytest
from pymatgen.io.cif import CifParser

from oximachine_api.features import feature_category, feature_names, featurize_structure, percentiles

from .conftest import STRUCTURES, TRAINING_FEATURES, golden

# Small/fast structures; legacy/compare_features.py covers all 72.
NAMES = ["ACITAK", "AFENAA", "HOJHUM"]


def load_cif(path):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return CifParser(str(path), occupancy_tolerance=100).parse_structures(primitive=False)[0]


@pytest.mark.parametrize("name", NAMES)
def test_features_match_legacy(name):
    x, _, metals = featurize_structure(load_cif(STRUCTURES / f"{name}.cif"))
    ref = golden(name)
    assert [m.split()[0] for m in ref["feature_value_dict"]] == metals
    np.testing.assert_allclose(x, ref["feature_array"], rtol=0, atol=1e-7)


@pytest.mark.parametrize("name", NAMES)
def test_percentiles_and_categories_match_legacy(name):
    ref = golden(name)
    x = np.asarray(ref["feature_array"])
    pct = percentiles(x, TRAINING_FEATURES)
    names = feature_names()
    for i, feats in enumerate(ref["feature_value_dict"].values()):
        for j, (_value, p, _color, category) in enumerate(feats.values()):
            assert pct[i, j] == int(p)
            assert feature_category(names[j]) == category
