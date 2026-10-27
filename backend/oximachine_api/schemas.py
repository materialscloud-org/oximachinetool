"""Request/response models of the API (mirrored in frontend/src/api.js)."""

from typing import Any

from pydantic import BaseModel, Field


class ComputeRequest(BaseModel):
    structure: dict[str, Any] = Field(
        description="pymatgen Structure.as_dict(), e.g. from matsci-parse toPymatgen()"
    )
    approximate_shap: bool = Field(
        True, description="Fast (Saabas-style) approximation of the SHAP values"
    )


class Feature(BaseModel):
    name: str
    value: float
    percentile: int = Field(description="Position within the training set, 0-100")
    category: str = Field(description="metal, geometry or chemistry")


class Shap(BaseModel):
    base_value: float
    values: list[float] = Field(description="Aligned with feature_names")


class Site(BaseModel):
    label: str = Field(examples=["Cu a"])
    element: str
    site_index: int = Field(description="Index into primitive_structure.sites")
    oxidation_state: int
    probability: float
    base_model_predictions: list[int]
    agreement: float = Field(description="% of base models agreeing with the ensemble")
    nearest_training_structures: list[str] = Field(description="CSD refcodes")
    shap: Shap | None = Field(description="None if the explainer has no output for this state")
    features: list[Feature]


class ComputeResponse(BaseModel):
    model_version: str
    compute_time: float
    warning: str | None
    primitive_structure: dict[str, Any]
    feature_names: list[str]
    sites: list[Site]
