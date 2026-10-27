"""The oxiMACHINE "mof_chemarxiv" model, rebuilt from exported parameters.

legacy/export_model.py wrote the learned parameters of the original
scikit-learn 0.22 / shap 0.35 pickles to model.json + model.npz (and
explainer.json + explainer.npz). Inference is reimplemented here following
the 0.22 code paths exactly, so the model no longer depends on any particular
scikit-learn version; tests/test_model.py checks it against outputs the legacy
objects produced.

Ensemble: a soft-voting classifier over four isotonic-calibrated estimators
(kNN, gradient boosting, SGD logistic regression, extra trees). The
explainer is a TreeExplainer over the extra-trees model.
"""

import json
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import numpy as np
import shap
from sklearn.neighbors import KDTree, KNeighborsClassifier

DATA_DIR = Path(__file__).parent / "model_data"

# GradientBoosting init (MultinomialDeviance.get_init_raw_predictions).
_EPS32 = np.finfo(np.float32).eps


# --- trees -------------------------------------------------------------------


class Tree:
    """A fitted sklearn tree as node arrays."""

    def __init__(self, spec, arrays):
        self.left = arrays[spec["children_left"]]
        self.right = arrays[spec["children_right"]]
        self.feature = arrays[spec["feature"]]
        self.threshold = arrays[spec["threshold"]]
        self.value = arrays[spec["value"]]  # (n_nodes, n_outputs, n_classes)

    def apply(self, x32):
        """Leaf index per row. sklearn compares float32 inputs with float64
        thresholds (X is cast to float32 before predicting)."""
        node = np.zeros(len(x32), dtype=np.intp)
        active = self.left[node] != -1
        while active.any():
            rows = np.flatnonzero(active)
            n = node[rows]
            go_left = x32[rows, self.feature[n]] <= self.threshold[n]
            node[rows] = np.where(go_left, self.left[n], self.right[n])
            active[rows] = self.left[node[rows]] != -1
        return node


# --- base estimators -----------------------------------------------------------


class ExtraTrees:
    def __init__(self, spec, arrays):
        self.classes = np.asarray(spec["classes"])
        self.n_classes = spec["n_classes"]
        self.trees = [Tree(t, arrays) for t in spec["trees"]]

    def predict_proba(self, x):
        x32 = x.astype(np.float32)
        proba = np.zeros((len(x), self.n_classes))
        for tree in self.trees:
            p = tree.value[tree.apply(x32), 0, : self.n_classes]
            norm = p.sum(axis=1, keepdims=True)
            norm[norm == 0.0] = 1.0
            proba += p / norm
        return proba / len(self.trees)


class GradientBoosting:
    def __init__(self, spec, arrays):
        self.classes = np.asarray(spec["classes"])
        self.learning_rate = spec["learning_rate"]
        self.init_prior = arrays[spec["init_class_prior"]]
        self.stages = [[Tree(t, arrays) for t in stage] for stage in spec["trees"]]

    def decision_function(self, x):
        x32 = x.astype(np.float32)
        prior = np.clip(self.init_prior, _EPS32, 1 - _EPS32)
        raw = np.tile(np.log(prior).astype(np.float64), (len(x), 1))
        for stage in self.stages:
            for k, tree in enumerate(stage):
                raw[:, k] += self.learning_rate * tree.value[tree.apply(x32), 0, 0]
        return raw


class SGDLogistic:
    def __init__(self, spec, arrays):
        self.classes = np.asarray(spec["classes"])
        self.coef = arrays[spec["coef"]]
        self.intercept = arrays[spec["intercept"]]

    def decision_function(self, x):
        return x @ self.coef.T + self.intercept


class KNN:
    """Delegates to scikit-learn: refitting kNN just stores the training set."""

    def __init__(self, spec, arrays):
        self.classes = np.asarray(spec["classes"])
        self.knn = KNeighborsClassifier(
            n_neighbors=spec["n_neighbors"],
            weights=spec["weights"],
            metric=spec["metric"],
            metric_params=spec["metric_params"] or None,
            algorithm="kd_tree",
        ).fit(arrays[spec["fit_X"]], self.classes[arrays[spec["y"]]])
        assert np.array_equal(self.knn.classes_, self.classes)

    def predict_proba(self, x):
        return self.knn.predict_proba(x)


BASE_TYPES = {
    "ExtraTreesClassifier": ExtraTrees,
    "GradientBoostingClassifier": GradientBoosting,
    "SGDClassifier": SGDLogistic,
    "KNeighborsClassifier": KNN,
}


# --- calibration ---------------------------------------------------------------


@dataclass
class Isotonic:
    X: np.ndarray
    y: np.ndarray
    X_min: float
    X_max: float

    def predict(self, t):
        # out_of_bounds="clip" + linear interpolation, as IsotonicRegression.
        return np.interp(np.clip(t, self.X_min, self.X_max), self.X, self.y)


class CalibratedEstimator:
    """sklearn 0.22 calibration._CalibratedClassifier.predict_proba."""

    def __init__(self, spec, arrays):
        base = spec["base"]
        self.base = BASE_TYPES[base["type"]](base, arrays)
        self.name = base["type"]
        self.calibrated = spec["calibration"] is not None
        if not self.calibrated:
            self.classes = self.base.classes
            return
        self.classes = np.asarray(spec["classes"])
        self.pos_class_idx = spec["pos_class_idx"]
        self.uses_decision_function = spec["uses_decision_function"]
        self.calibrators = [
            Isotonic(arrays[c["X"]], arrays[c["y"]], c["X_min"], c["X_max"])
            for c in spec["calibrators"]
        ]

    def predict_proba(self, x):
        if not self.calibrated:
            return self.base.predict_proba(x)
        n_classes = len(self.classes)
        if self.uses_decision_function:
            df = self.base.decision_function(x)
            if df.ndim == 1:
                df = df[:, np.newaxis]
        else:
            df = self.base.predict_proba(x)
            if n_classes == 2:
                df = df[:, 1:]

        proba = np.zeros((len(x), n_classes))
        for k, column, calibrator in zip(self.pos_class_idx, df.T, self.calibrators, strict=True):
            if n_classes == 2:
                k += 1
            proba[:, k] = calibrator.predict(column)

        if n_classes == 2:
            proba[:, 0] = 1.0 - proba[:, 1]
        else:
            with np.errstate(invalid="ignore", divide="ignore"):
                proba /= np.sum(proba, axis=1)[:, np.newaxis]
        proba[np.isnan(proba)] = 1.0 / n_classes
        proba[(1.0 < proba) & (proba <= 1.0 + 1e-5)] = 1.0
        return proba


# --- the full model ------------------------------------------------------------


@dataclass
class Predictions:
    oxidation_state: np.ndarray  # (n,)
    probability: np.ndarray  # (n,) max ensemble probability
    base_predictions: np.ndarray  # (n, n_estimators) oxidation states
    agreement: np.ndarray  # (n,) % of base estimators agreeing with the ensemble
    class_index: np.ndarray  # (n,) index of the prediction in `classes`


class OximachineModel:
    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = Path(data_dir)
        self.manifest = json.loads((self.data_dir / "model.json").read_text())
        arrays = np.load(self.data_dir / "model.npz", allow_pickle=False)
        arrays = {k: arrays[k] for k in arrays.files}

        self.scaler_mean = arrays[self.manifest["scaler"]["mean"]]
        self.scaler_scale = arrays[self.manifest["scaler"]["scale"]]

        clf = self.manifest["classifier"]
        self.voting = clf["voting"]
        self.weights = clf["weights"]
        self.classes = np.asarray(clf["classes"])
        self.estimators = [CalibratedEstimator(e, arrays) for e in clf["estimators"]]
        for est in self.estimators:
            assert np.array_equal(est.classes, self.classes), est.name

        neighbors = self.manifest["neighbors"]
        kd_data = (
            self.scale(np.load(self.training_features_path, allow_pickle=False))
            if neighbors["data"] is None  # built on the scaled training features
            else arrays[neighbors["data"]]
        )
        self.kdtree = KDTree(kd_data, metric=neighbors["metric"])
        self.training_names = json.loads(
            (self.data_dir / neighbors["names_file"]).read_text()
        )

    @property
    def n_features(self) -> int:
        return self.manifest["n_features"]

    @property
    def version(self) -> str:
        md5 = self.manifest["source_md5"]["classifier"]
        return f"{self.manifest['model']} (md5: {md5})"

    @property
    def training_features_path(self) -> Path:
        return self.data_dir / "training_features.npy"

    def scale(self, x_raw):
        return (np.asarray(x_raw, dtype=np.float64) - self.scaler_mean) / self.scaler_scale

    def estimator_probas(self, x_scaled):
        return np.stack([est.predict_proba(x_scaled) for est in self.estimators])

    def predict(self, x_raw) -> Predictions:
        x = self.scale(x_raw)
        probas = self.estimator_probas(x)  # (n_estimators, n, n_classes)
        ensemble = np.average(probas, axis=0, weights=self.weights)
        base_idx = np.argmax(probas, axis=2).T  # (n, n_estimators)

        if self.voting == "soft":
            class_index = np.argmax(ensemble, axis=1)
        else:
            class_index = np.array(
                [np.argmax(np.bincount(row, weights=self.weights)) for row in base_idx]
            )
        prediction = self.classes[class_index]
        base_predictions = self.classes[base_idx]
        agreement = (base_predictions == prediction[:, None]).mean(axis=1) * 100
        return Predictions(
            oxidation_state=prediction,
            probability=ensemble.max(axis=1),
            base_predictions=base_predictions,
            agreement=agreement,
            class_index=class_index,
        )

    def nearest_training_structures(self, x_raw, k: int = 4) -> list[list[str]]:
        """CSD refcodes of the k nearest training points (scaled feature space),
        closest first, without duplicates."""
        _, idx = self.kdtree.query(self.scale(x_raw), k=k)
        return [list(dict.fromkeys(self.training_names[i] for i in row)) for row in idx]

    @cached_property
    def explainer(self) -> "Explainer":
        # The explainer is over the extra-trees model, whose outputs are its
        # own classes (not necessarily all ensemble classes).
        extra_trees = next(e for e in self.estimators if e.name == "ExtraTreesClassifier")
        return Explainer(self.data_dir, classes=extra_trees.base.classes)


class Explainer:
    """SHAP TreeExplainer over the extra-trees model, rebuilt from its tree
    arrays (shap accepts a dict of trees)."""

    def __init__(self, data_dir: Path, classes: np.ndarray):
        self.classes = np.asarray(classes)
        spec = json.loads((data_dir / "explainer.json").read_text())
        arrays = np.load(data_dir / "explainer.npz", allow_pickle=False)
        keys = (
            "children_left",
            "children_right",
            "children_default",
            "features",
            "thresholds",
            "values",
            "node_sample_weight",
        )
        trees = [{k: arrays[t[k]] for k in keys} for t in spec["trees"]]
        n_outputs = trees[0]["values"].shape[1]
        model = {
            "trees": trees,
            # shap 0.35 kept a scalar offset and broadcast it; current shap
            # wants one per output.
            "base_offset": np.broadcast_to(arrays[spec["base_offset"]], n_outputs).copy(),
            "tree_output": spec["tree_output"],
            "objective": spec["objective"],
            "input_dtype": np.float32,
            "internal_dtype": np.float64,
        }
        data = None if spec["data"] is None else arrays[spec["data"]]
        perturbation = spec["feature_perturbation"] or (
            "tree_path_dependent" if data is None else "interventional"
        )
        self.expected_value = np.atleast_1d(arrays[spec["expected_value"]])
        assert len(self.expected_value) == n_outputs == len(self.classes)
        self.tree_explainer = shap.TreeExplainer(
            model,
            data=data,
            feature_perturbation=perturbation,
            model_output=spec["model_output"],
        )

    def output_index(self, oxidation_state: int) -> int | None:
        """Explainer output explaining a given oxidation state, if any."""
        hits = np.flatnonzero(self.classes == oxidation_state)
        return int(hits[0]) if len(hits) else None

    def shap_values(self, x_scaled, approximate: bool = True) -> np.ndarray:
        """SHAP values as (n_outputs, n_rows, n_features)."""
        values = self.tree_explainer.shap_values(
            x_scaled, approximate=approximate, check_additivity=False
        )
        values = np.asarray(values)
        n_features = x_scaled.shape[1]
        if values.ndim == 3 and values.shape[-1] != n_features:
            values = np.moveaxis(values, 2, 0)  # (n, f, k) in shap >= 0.45
        return values
