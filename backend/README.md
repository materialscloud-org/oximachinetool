# oxiMACHINE backend

FastAPI service behind the React frontend in `../frontend`. One endpoint does
the work:

- `POST /api/compute`: `{ structure: <pymatgen Structure dict>, approximate_shap: bool }`
  returns the primitive cell, and for every metal site the predicted
  oxidation state, confidence, base-model votes, nearest training structures,
  feature values and SHAP feature importance. See `oximachine_api/schemas.py`
  (and the same contract in `frontend/src/api.js`).
- `GET /api/health`

The built frontend (`../frontend/dist`) is served at `/` when present.

```bash
uv sync
uv run uvicorn oximachine_api.main:app --reload   # http://localhost:8000
# frontend dev server, proxies /api to :8000
(cd ../frontend && pnpm dev)
```

## The model

The original model (Zenodo [4361094](https://zenodo.org/record/4361094),
`mof_chemarxiv`) was pickled with scikit-learn 0.21/0.22 and shap 0.35, whose
internal classes no longer exist. It has been exported once to plain arrays
(`oximachine_api/model_data/`) and inference is reimplemented on top of them
in `oximachine_api/model.py`, so the service runs on current Python and
libraries.

To (re)generate `model_data/` and the reference outputs the tests compare
against, follow the docstring of `legacy/export_model.py`: it runs in a
throwaway Python 3.8 environment with the original library versions.

## Performance

The featurizer (`oximachine-featurizer`) builds the Voronoi polyhedron of each
metal site twice, with pymatgen's VoronoiNN and a neighbor cutoff equal to the
longest diagonal of the cell, so its cost grows with the cube of the cell size
(minutes per structure for long cells). `oximachine_api/voronoi.py` replaces
`VoronoiNN.get_voronoi_polyhedra` with one that tessellates a small
neighborhood and grows it until the cell is provably unaffected by farther
atoms (all its vertices within half the radius), falling back to the original
method otherwise; `features.py` also builds the site featurizers once per
structure instead of once per site. Same polyhedra, about 20x faster on the
72 precomputed structures (433 s to 22 s); `legacy/compare_voronoi.py` checks
it:

```bash
uv run python legacy/compare_voronoi.py tests/golden/structures   # [NAME ...]
```

71 of 72 give identical features (1e-9). In ENATUJ one CrystalNN order
parameter (`body-centered cubic CN_8`) changes by 3e-5, because it depends on
the order qhull lists the neighbors in; it is as sensitive to library
versions (it differs from the legacy value by 2.5e-5 without this change), and
the predictions are identical.

## Checks against the legacy service

- `tests/test_features.py`: the featurizer reproduces the legacy feature
  matrices. `legacy/compare_features.py` runs this over all 72 precomputed
  structures.
- `tests/test_model.py`: every calibrated estimator, the ensemble, the nearest
  neighbours and the SHAP values match outputs of the legacy objects, and the
  predictions of all 72 precomputed results of the old web service are
  reproduced from their stored features.
- `tests/test_api.py`: the endpoint end to end, plus rejected inputs.

Two behaviours of current pymatgen differ from what the model was trained
with and are compensated for in `features.py`: the `row`/`column` features of
lanthanides and actinides (pymatgen 2020 numbering is used), and partially
featurized structures (the featurizer swallows errors and returns fewer rows
than metal sites; this is now an error instead of a silently shortened
result).

`tests/golden/precomputed/` holds the legacy precomputed results, converted
from pickles by `legacy/convert_precomputed.py`.
