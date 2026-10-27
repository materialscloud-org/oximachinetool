"""One-off export of the legacy oxiMACHINE model to a version-independent format.

The original artifacts are pickles of scikit-learn 0.21/0.22 and shap 0.35
objects, which modern versions cannot load. This script runs in a *legacy*
environment, loads them once, and writes out only the learned parameters
(plain arrays + JSON), together with reference outputs computed by the legacy
code itself. The modern backend rebuilds the predictor from these files and
its tests check it reproduces the reference outputs.

Legacy environment (Python 3.8):
    uv venv --python 3.8 /tmp/oxi-legacy
    VIRTUAL_ENV=/tmp/oxi-legacy uv pip install numpy==1.19.5 scipy==1.5.4 \
        scikit-learn==0.22.2.post1 joblib==0.17.0 pandas==1.1.5 tqdm \
        setuptools wheel cython
    VIRTUAL_ENV=/tmp/oxi-legacy uv pip install --no-build-isolation shap==0.35.0

Inputs: classifier/scaler from https://zenodo.org/record/4361094
(mof_chemarxiv_*.joblib); explainer.joblib, kd_tree.joblib, names.pkl and
features.npy from webservice/compute/ of the legacy Flask app, which was
removed from this repository. Restore them from git history:

    git archive 0c46b5f webservice/compute/{explainer.joblib,kd_tree.joblib,names.pkl,features.npy} \
        | tar -x -C /tmp/oxi-legacy-src

    /tmp/oxi-legacy/bin/python legacy/export_model.py \
        --classifier mof_chemarxiv_classifier.joblib \
        --scaler mof_chemarxiv_scaler.joblib \
        --compute-dir /tmp/oxi-legacy-src/webservice/compute \
        --out oximachine_api/model_data \
        --reference tests/golden/model_reference.npz
"""
# Python 3.8 syntax only: this runs in the legacy environment.

import argparse
import hashlib
import json
import pickle
import sys
import types
import warnings
from pathlib import Path

import joblib
import numpy as np
import shap
import sklearn

warnings.simplefilter("ignore")

EXPECTED_MD5 = {
    "classifier": "2fee4c35f475fa2f8123e7451f6a2f74",
    "scaler": "c5c22e22137afaa7d815b0162753b424",
}


def install_learnmofox_shim():
    """The classifier pickle references learnmofox.utils.VotingClassifier.
    Unpickling only restores its __dict__; the inference methods below are
    copied verbatim from oximachinerunner 1.4.0 (learnmofox/utils.py), so the
    reference outputs come from the original code without needing that
    package (and its old pymatgen) installed."""
    pkg = types.ModuleType("learnmofox")
    utils = types.ModuleType("learnmofox.utils")

    class VotingClassifier:
        def predict(self, X):
            self._check_is_fitted()
            if self.voting == "soft":
                m = np.argmax(self.predict_proba(X), axis=1)
                if self.classes is not None:
                    maj = self.classes[m]
                else:
                    maj = m
            else:
                predictions = self._predict(X)
                m = np.apply_along_axis(
                    lambda x: np.argmax(np.bincount(x, weights=self.weights)),
                    axis=1,
                    arr=predictions.astype("int"),
                )
                if self.classes is not None:
                    maj = self.classes[m]
                else:
                    maj = m
            return maj

        def _collect_probas(self, X):
            return np.asarray([clf.predict_proba(X) for clf in self.estimators])

        def _check_is_fitted(self):
            for estimator in self._estimators:
                if not hasattr(estimator, "classes_"):
                    raise ValueError("Classifier not fitted")

        def _predict_proba(self, X):
            self._check_is_fitted()
            if self.voting == "hard":
                raise AttributeError("predict_proba is not available when voting=%r" % self.voting)
            return np.average(self._collect_probas(X), axis=0, weights=self.weights)

        @property
        def predict_proba(self):
            return self._predict_proba

        def _predict(self, X):
            return np.asarray([np.argmax(clf.predict_proba(X), axis=1) for clf in self.estimators]).T

    utils.VotingClassifier = VotingClassifier
    pkg.utils = utils
    sys.modules["learnmofox"] = pkg
    sys.modules["learnmofox.utils"] = utils


def md5(path):
    return hashlib.md5(Path(path).read_bytes()).hexdigest()


class Arrays:
    """Collects named arrays for one .npz file."""

    def __init__(self):
        self.data = {}

    def add(self, key, value):
        assert key not in self.data, key
        self.data[key] = np.asarray(value)
        return key


def export_tree(arrays, prefix, tree):
    """sklearn Tree -> node arrays (sklearn 0.22 layout)."""
    return {
        "children_left": arrays.add(prefix + "children_left", tree.children_left),
        "children_right": arrays.add(prefix + "children_right", tree.children_right),
        "feature": arrays.add(prefix + "feature", tree.feature),
        "threshold": arrays.add(prefix + "threshold", tree.threshold),
        # (n_nodes, n_outputs, n_classes)
        "value": arrays.add(prefix + "value", tree.value),
    }


def export_isotonic(arrays, prefix, iso):
    assert iso.out_of_bounds == "clip", iso.out_of_bounds
    return {
        "X": arrays.add(prefix + "X", iso._necessary_X_),
        "y": arrays.add(prefix + "y", iso._necessary_y_),
        "X_min": float(iso.X_min_),
        "X_max": float(iso.X_max_),
    }


def export_base(arrays, prefix, est):
    name = type(est).__name__
    spec = {"type": name, "classes": [int(c) for c in est.classes_]}

    if name == "KNeighborsClassifier":
        assert est.weights in ("uniform", "distance"), est.weights
        spec.update(
            n_neighbors=int(est.n_neighbors),
            weights=est.weights,
            metric=str(est.effective_metric_),
            metric_params=est.effective_metric_params_ or {},
            fit_X=arrays.add(prefix + "fit_X", est._fit_X),
            y=arrays.add(prefix + "y", est._y),
        )
    elif name == "SGDClassifier":
        assert est.loss == "log", est.loss
        spec.update(
            coef=arrays.add(prefix + "coef", est.coef_),
            intercept=arrays.add(prefix + "intercept", est.intercept_),
        )
    elif name == "GradientBoostingClassifier":
        assert type(est.loss_).__name__ == "MultinomialDeviance", est.loss_
        init = est.init_
        assert type(init).__name__ == "DummyClassifier" and init.strategy == "prior"
        spec.update(
            learning_rate=float(est.learning_rate),
            init_class_prior=arrays.add(prefix + "init_class_prior", init.class_prior_),
            trees=[
                [
                    export_tree(arrays, "{}s{}_k{}_".format(prefix, i, k), est.estimators_[i, k].tree_)
                    for k in range(est.estimators_.shape[1])
                ]
                for i in range(est.estimators_.shape[0])
            ],
        )
    elif name == "ExtraTreesClassifier":
        spec.update(
            n_classes=int(est.n_classes_),
            trees=[
                export_tree(arrays, "{}t{}_".format(prefix, i), tree.tree_)
                for i, tree in enumerate(est.estimators_)
            ],
        )
    else:
        raise NotImplementedError(name)
    return spec


def export_classifier(arrays, clf):
    estimators = []
    for i, cal in enumerate(clf.estimators):
        prefix = "e{}_".format(i)
        if type(cal).__name__ == "_CalibratedClassifier":
            assert cal.method == "isotonic", cal.method
            base = cal.base_estimator
            spec = {
                "calibration": "isotonic",
                "classes": [int(c) for c in cal.classes_],
                # index into cal.classes_ for each base-estimator class (_preproc)
                "pos_class_idx": [int(k) for k in cal.label_encoder_.transform(base.classes_)],
                "uses_decision_function": bool(hasattr(base, "decision_function")),
                "calibrators": [
                    export_isotonic(arrays, "{}cal{}_".format(prefix, k), c)
                    for k, c in enumerate(cal.calibrators_)
                ],
                "base": export_base(arrays, prefix + "base_", base),
            }
        else:
            spec = {"calibration": None, "base": export_base(arrays, prefix + "base_", cal)}
        estimators.append(spec)

    return {
        "voting": clf.voting,
        "weights": None if clf.weights is None else [float(w) for w in clf.weights],
        "classes": [int(c) for c in clf.classes],
        "estimators": estimators,
    }


def export_explainer(arrays, exp):
    ens = exp.model
    trees = []
    for i, t in enumerate(ens.trees):
        p = "shap_t{}_".format(i)
        trees.append(
            {
                "children_left": arrays.add(p + "children_left", t.children_left),
                "children_right": arrays.add(p + "children_right", t.children_right),
                "children_default": arrays.add(p + "children_default", t.children_default),
                "features": arrays.add(p + "features", t.features),
                "thresholds": arrays.add(p + "thresholds", t.thresholds),
                "values": arrays.add(p + "values", t.values),
                "node_sample_weight": arrays.add(p + "node_sample_weight", t.node_sample_weight),
            }
        )
    return {
        "trees": trees,
        "base_offset": arrays.add("shap_base_offset", ens.base_offset),
        "tree_output": ens.tree_output,
        "objective": ens.objective,
        "model_output": exp.model_output,
        "feature_perturbation": getattr(exp, "feature_perturbation", None),
        "data": None if exp.data is None else arrays.add("shap_data", exp.data),
        "expected_value": arrays.add("shap_expected_value", exp.expected_value),
    }


def reference_outputs(clf, scaler, explainer, kdtree, features, rng):
    """Outputs of the legacy objects, for the modern tests to reproduce."""
    idx = rng.choice(len(features), size=min(2000, len(features)), replace=False)
    x_raw = features[idx]
    x = scaler.transform(x_raw)
    ref = {
        "x_raw": x_raw,
        "x_scaled": x,
        "prediction": clf.predict(x),
        "proba": clf._predict_proba(x),
        "base_predictions": clf._predict(x),
        "estimator_proba": np.stack([c.predict_proba(x) for c in clf.estimators]),
    }
    _, ref["kd_neighbors"] = kdtree.query(x[:200], k=4)

    n_approx, n_exact = 200, 20
    approx = explainer.shap_values(x[:n_approx], approximate=True, check_additivity=False)
    exact = explainer.shap_values(x[:n_exact], approximate=False, check_additivity=False)
    ref["shap_approx"] = np.stack(approx)  # (n_classes, n_rows, n_features)
    ref["shap_exact"] = np.stack(exact)
    return ref


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--classifier", required=True)
    ap.add_argument("--scaler", required=True)
    ap.add_argument("--compute-dir", required=True, help="legacy webservice/compute (see docstring)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--reference", required=True)
    args = ap.parse_args()

    for key in ("classifier", "scaler"):
        got = md5(getattr(args, key))
        if got != EXPECTED_MD5[key]:
            sys.exit("{}: md5 {} != expected {}".format(key, got, EXPECTED_MD5[key]))

    install_learnmofox_shim()
    compute = Path(args.compute_dir)
    clf = joblib.load(args.classifier)
    scaler = joblib.load(args.scaler)
    explainer = joblib.load(compute / "explainer.joblib")
    kdtree = joblib.load(compute / "kd_tree.joblib")
    with open(compute / "names.pkl", "rb") as fh:
        names = [str(n) for n in pickle.load(fh)]
    features = np.load(compute / "features.npy", allow_pickle=False)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model_arrays = Arrays()
    manifest = {
        "model": "mof_chemarxiv",
        "source": "https://zenodo.org/record/4361094",
        "source_md5": EXPECTED_MD5,
        "exported_with": {
            "python": sys.version.split()[0],
            "sklearn": sklearn.__version__,
            "shap": shap.__version__,
            "numpy": np.__version__,
        },
        "n_features": int(scaler.mean_.shape[0]),
        "scaler": {
            "mean": model_arrays.add("scaler_mean", scaler.mean_),
            "scale": model_arrays.add("scaler_scale", scaler.scale_),
        },
        "classifier": export_classifier(model_arrays, clf),
    }
    kd_data, _, _, _ = kdtree.get_arrays()
    assert len(kd_data) == len(names), (len(kd_data), len(names))
    # The KD tree is normally built on the scaled training features; store its
    # data only if it is something else.
    from_features = kd_data.shape == features.shape and bool(
        np.allclose(kd_data, scaler.transform(features), rtol=0, atol=1e-12)
    )
    manifest["neighbors"] = {
        "metric": "euclidean",
        "data": None if from_features else model_arrays.add("kd_data", kd_data),
        "names_file": "training_names.json",
    }

    shap_arrays = Arrays()
    explainer_spec = export_explainer(shap_arrays, explainer)

    np.savez_compressed(out / "model.npz", **model_arrays.data)
    np.savez_compressed(out / "explainer.npz", **shap_arrays.data)
    (out / "model.json").write_text(json.dumps(manifest, indent=1))
    (out / "explainer.json").write_text(json.dumps(explainer_spec, indent=1))
    (out / "training_names.json").write_text(json.dumps(names))
    np.save(out / "training_features.npy", features)

    ref = reference_outputs(clf, scaler, explainer, kdtree, features, np.random.RandomState(0))
    Path(args.reference).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.reference, **ref)

    print("estimators:", [e["base"]["type"] for e in manifest["classifier"]["estimators"]])
    print("voting:", manifest["classifier"]["voting"], "classes:", manifest["classifier"]["classes"])
    background = None if explainer.data is None else explainer.data.shape
    print("explainer:", len(explainer_spec["trees"]), "trees,", explainer_spec["model_output"],
          explainer_spec["feature_perturbation"], "background data:", background)
    print("wrote", out, "and", args.reference)


if __name__ == "__main__":
    main()
