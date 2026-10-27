"""Featurization of metal sites, and how each feature value compares with the
training set (percentile + colour category, as shown in the UI)."""

from functools import cache
from pathlib import Path

import numpy as np
from oximachine_featurizer.featurize import featurize, get_feature_names
from pymatgen.core import Structure

# Feature set of the "mof_chemarxiv" model (oximachinerunner config).
FEATURESET = [
    "local_property_stats",
    "column",
    "row",
    "valenceelectrons",
    "diffto18electrons",
    "sunfilled",
    "punfilled",
    "dunfilled",
    "crystal_nn_no_steinhardt",
]

def feature_names() -> list[str]:
    return get_feature_names(FEATURESET)


def display_name(name: str) -> str:
    return name.replace("mimum", "minimum")  # typo in the featurizer's labels


GROUP_CATEGORY = {"local_property_stats": "chemistry", "crystal_nn_no_steinhardt": "geometry"}


@cache
def _categories() -> dict[str, str]:
    return {
        name: GROUP_CATEGORY.get(group, "metal")
        for group in FEATURESET
        for name in get_feature_names([group])
    }


def feature_category(name: str) -> str:
    """'metal', 'geometry' or 'chemistry', as in the original feature table."""
    return _categories()[name]


_ROW_SIZES = (2, 8, 8, 18, 18, 32, 32)


def legacy_row(z: int) -> int:
    """Element.row as in pymatgen 2020, which the model was trained with:
    lanthanides are row 8 and actinides row 9 (current pymatgen: 6 and 7)."""
    if 57 <= z <= 71:
        return 8
    if 89 <= z <= 103:
        return 9
    total = 0
    for i, size in enumerate(_ROW_SIZES):
        total += size
        if total >= z:
            return i + 1
    raise ValueError(z)


def legacy_group(z: int) -> int:
    """Element.group as in pymatgen 2020: f-block elements are numbered
    3-17 across the block (current pymatgen: 3)."""
    if z == 1:
        return 1
    if z == 2:
        return 18
    if 3 <= z <= 18:
        if (z - 2) % 8 == 0:
            return 18
        if (z - 2) % 8 <= 2:
            return (z - 2) % 8
        return 10 + (z - 2) % 8
    if 19 <= z <= 54:
        if (z - 18) % 18 == 0:
            return 18
        return (z - 18) % 18
    if (z - 54) % 32 == 0:
        return 18
    if (z - 54) % 32 >= 18:
        return (z - 54) % 32 - 14
    return (z - 54) % 32


def featurize_structure(structure: Structure) -> tuple[np.ndarray, list[int], list[str]]:
    """Feature matrix (one row per metal site), metal site indices, metal symbols."""
    x, metal_indices, metals = featurize(structure, FEATURESET)
    if len(x) != len(metals):
        # The featurizer logs and swallows errors, returning only the sites
        # featurized so far.
        raise ValueError(f"featurized {len(x)} of {len(metals)} metal sites")

    names = get_feature_names(FEATURESET)
    col, row = names.index("column"), names.index("row")
    for i, index in enumerate(metal_indices):
        z = structure[index].specie.Z
        x[i, col] = legacy_group(z)
        x[i, row] = legacy_row(z)
    return x, metal_indices, metals


@cache
def _training_features(path: Path) -> np.ndarray:
    # One column per feature, sorted, for fast percentile lookups.
    return np.sort(np.load(path, allow_pickle=False), axis=0)


def percentiles(x: np.ndarray, training_features: Path) -> np.ndarray:
    """Percentile of each feature value within the training set.

    Matches scipy.stats.percentileofscore(kind="rank"), which the legacy
    service used, truncated to int.
    """
    train = _training_features(training_features)
    n = train.shape[0]
    out = np.empty(x.shape, dtype=int)
    for j in range(x.shape[1]):
        col = train[:, j]
        left = np.searchsorted(col, x[:, j], side="left")
        right = np.searchsorted(col, x[:, j], side="right")
        # kind="rank": mean of strict and weak percentiles when ties exist.
        pct = (left + right + (right > left)) * 50.0 / n
        out[:, j] = pct.astype(int)
    return out
