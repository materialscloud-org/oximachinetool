# oxiMACHINE app

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.3603606.svg)](https://doi.org/10.5281/zenodo.3603606)

<img src="frontend/public/oximachine_logo.png" width="200px">

Web app that predicts the oxidation states of metal sites in metal-organic
frameworks, with confidence, nearest training structures, feature values and
feature importance for each site.

Everything runs in the browser: structures are parsed with
[matsci-parse](https://www.npmjs.com/package/matsci-parse), and the
featurization, the model and the feature importance (SHAP) are JavaScript
ports of the Python implementation, checked against it (where they can
differ: [MIGRATION_NOTES.md](MIGRATION_NOTES.md)).

- `frontend/`: React (Vite + Tailwind) single-page app. `App.jsx` is the page,
  `src/FileUpload/` the structure upload; the tool is in `src/OxiMachine/`:
  `compute.js` (the pipeline, run in a Web Worker by `worker.js`),
  `model.js` (ensemble, nearest training structures, SHAP,
  percentiles) and `features/` (the 116 features of a metal site).
- `frontend/public/model/`: the model for the browser (in git), built by
  `backend/scripts/build_web_model.py`.
- `backend/`: the Python reference: the model exported from the original
  pickles (`oximachine_api/model_data/`), its reimplementation, and the
  scripts that build the browser model and the reference outputs the
  frontend tests compare against. See [backend/README.md](backend/README.md).

## Running it

```bash
cd frontend && pnpm install && pnpm dev   # http://localhost:5173
pnpm test    # the JS ports against the Python reference (~2 min)
pnpm build   # static site in dist/
```

## The model data

The browser model is rebuilt from the export in
`backend/oximachine_api/model_data/` (only needed if that changes):

```bash
cd backend && uv sync
uv run python scripts/build_web_model.py       # -> frontend/public/model/
uv run python scripts/build_web_reference.py   # -> frontend/tests/reference.json.gz
```

The app downloads about 4.8 MB up front (`manifest.json` and
`model.bin.gz`), and then, per structure, the training points its
nearest-neighbour searches need (`rows/*.bin.gz`, 94 files of 512 points;
typically 1.3 MB for a MOF, cached by the browser). Every result is exactly
the Python model's (`pnpm test`):

- The kNN estimator and the nearest training structures search the
  training points exactly, in order of a lower bound of their distance from
  a coarse copy of every point (each feature as one of 64 bins), fetching
  exact values only for the points the bounds cannot exclude.
- Percentiles use only the training values where they change (60 kB instead
  of the 39 MB training set).
- The SHAP explainer reuses the extra trees.

The docstring of `build_web_model.py` has the details.

## History

Until version 1.x this was a Flask app on the Materials Cloud
`tools-barebone` image (Python 3.6, Apache), with structures parsed by `c2x`
and the model run through
[oximachinerunner](https://github.com/kjappelbaum/oximachinerunner). That
implementation is in the git history (last commit `0c46b5f`). The model is
unchanged: its parameters were exported from the original scikit-learn pickles
and the new backend reproduces the legacy predictions (see
`backend/README.md`).

# Acknowledgments

- Materials Cloud team, especially [Leopold Talirz](https://github.com/ltalirz) for help with deployment, valuable feedback and a good template.
- Internally, we use [pymatgen](https://pymatgen.org/): Ong, S. P.; Richards, W. D.; Jain, A.; Hautier, G.; Kocher, M.; Cholia, S.; Gunter, D.; Chevrier, V. L.; Persson, K. A.; Ceder, G. Python Materials Genomics (Pymatgen): A Robust, Open-Source Python Library for Materials Analysis. Computational Materials Science 2013, 68, 314–319.
- Metal sites are featurized with [matminer](https://hackingmaterials.lbl.gov/matminer/) via [oximachine_featurizer](https://github.com/kjappelbaum/oximachine_featurizer).
- Feature importance is calculated using a [SHAP TreeExplainer](https://github.com/shap/shap): Lundberg, S. M.; Erion, G.; Chen, H.; DeGrave, A.; Prutkin, J. M.; Nair, B.; Katz, R.; Himmelfarb, J.; Bansal, N.; Lee, S.-I. From Local Explanations to Global Understanding with Explainable AI for Trees. Nature Machine Intelligence 2020, 2 (1), 2522–5839.
- Models were trained using [scikit-learn](https://scikit-learn.org/): Scikit-learn: Machine Learning in Python, Pedregosa et al., JMLR 12, pp. 2825-2830, 2011.
- The original app built heavily on the [seekpath web app](https://github.com/giovannipizzi/seekpath) and used [`c2x`](https://www.c2x.org.uk/) (Rutter, M. J. Computer Physics Communications 2018, 225, 174–179), [ase](https://wiki.fysik.dtu.dk/ase/), [flask](https://flask.palletsprojects.com/) and [jsmol](https://jsmol.com/).
