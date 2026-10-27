"""The /compute pipeline: structure -> primitive cell -> features ->
predictions, nearest training structures and feature importance."""

import time

from pymatgen.core import Structure

from .features import display_name, feature_category, feature_names, featurize_structure, percentiles
from .model import OximachineModel
from .schemas import ComputeResponse, Feature, Shap, Site

MAX_NUMBER_OF_ATOMS = 500
MIN_DISTANCE = 0.5  # Å; closer atoms are treated as overlapping

# Site labels of the legacy service (sic: no "k", "C" or "W"), kept so labels
# match previously computed results; numbered beyond its length.
SITE_LETTERS = "abcdefghijlmnopqrstuvwxyzABZDEFGHIJKLMNOPQRSTUVQXYZ0123456789"

RARE_METALS = {"Ag", "Ce", "Er", "Hg", "Nb", "Os", "Pt", "Sn", "Yb", "Pu"}
RARE_METAL_WARNING = (
    "Your structure contains an element that is rare in MOFs. The prediction might be wrong."
)


class InputError(ValueError):
    """The structure cannot be processed; the message is shown to the user."""


def site_label(element: str, i: int) -> str:
    return f"{element} {SITE_LETTERS[i] if i < len(SITE_LETTERS) else i + 1}"


def minimal_structure_dict(structure: Structure) -> dict:
    """Just what matsci-parse fromPymatgen() needs."""
    return {
        "lattice": {"matrix": structure.lattice.matrix.tolist()},
        "sites": [
            {"species": [{"element": site.specie.symbol, "occu": 1}], "abc": site.frac_coords.tolist()}
            for site in structure
        ],
    }


def load_primitive(structure_dict: dict) -> Structure:
    try:
        structure = Structure.from_dict(structure_dict)
    except Exception as exc:
        raise InputError(f"Could not read the structure: {exc}") from exc
    if not structure.is_ordered:
        raise InputError("oxiMACHINE only supports ordered structures (no partial occupancies).")

    primitive = structure.get_primitive_structure()
    if len(primitive) > MAX_NUMBER_OF_ATOMS:
        raise InputError(
            f"Sorry, this online tool is limited to {MAX_NUMBER_OF_ATOMS} atoms in the "
            f"primitive cell, while your structure has {len(primitive)} atoms."
        )
    if len(primitive) > 1 and not primitive.is_valid(tol=MIN_DISTANCE):
        raise InputError(
            "Sorry, there seem to be overlapping atoms in the input structure "
            f"(closer than {MIN_DISTANCE} Å)."
        )
    return primitive


def compute(structure_dict: dict, approximate_shap: bool, model: OximachineModel) -> ComputeResponse:
    start = time.time()
    primitive = load_primitive(structure_dict)
    names = feature_names()

    def response(sites: list[Site], warning: str | None = None) -> ComputeResponse:
        return ComputeResponse(
            model_version=model.version,
            compute_time=time.time() - start,
            warning=warning,
            primitive_structure=minimal_structure_dict(primitive),
            feature_names=[display_name(n) for n in names],
            sites=sites,
        )

    if not any(site.specie.is_metal for site in primitive):
        return response([])

    try:
        x, metal_indices, metals = featurize_structure(primitive)
    except Exception as exc:
        raise InputError(
            "Sorry, the featurization failed. Make sure that your structure is not "
            "pathological (e.g. containing overlapping atoms)."
        ) from exc

    preds = model.predict(x)
    neighbors = model.nearest_training_structures(x)
    shap_values = model.explainer.shap_values(model.scale(x), approximate=approximate_shap)
    pct = percentiles(x, model.training_features_path)

    sites = []
    for i, (index, element) in enumerate(zip(metal_indices, metals, strict=True)):
        state = int(preds.oxidation_state[i])
        k = model.explainer.output_index(state)
        sites.append(
            Site(
                label=site_label(element, i),
                element=element,
                site_index=int(index),
                oxidation_state=state,
                probability=float(preds.probability[i]),
                base_model_predictions=[int(p) for p in preds.base_predictions[i]],
                agreement=float(preds.agreement[i]),
                nearest_training_structures=neighbors[i],
                shap=None
                if k is None
                else Shap(
                    base_value=float(model.explainer.expected_value[k]),
                    values=shap_values[k, i].tolist(),
                ),
                features=[
                    Feature(
                        name=display_name(name),
                        value=float(x[i, j]),
                        percentile=int(pct[i, j]),
                        category=feature_category(name),
                    )
                    for j, name in enumerate(names)
                ],
            )
        )

    warning = RARE_METAL_WARNING if RARE_METALS & set(metals) else None
    return response(sites, warning)
