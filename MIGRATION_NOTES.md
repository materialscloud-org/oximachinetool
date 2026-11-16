# Migration notes: Python backend → browser

Since version 2 the whole computation runs in the browser
(`frontend/src/OxiMachine/`), ported from the Python implementation in
`backend/oximachine_api/` (itself checked against the legacy service). This
file records where the two can differ.

## What is identical

Given the same features, the model is the same: predictions, probabilities,
base-model votes, nearest training structures, percentiles and SHAP values
(approximate and exact) match the Python model to 1e-12 on the 758 metal
sites of the 72 legacy precomputed results (`frontend/tests/model.test.mjs`).

The featurizer reproduces the legacy feature matrices of those 72 structures
(`frontend/tests/featurize.test.mjs`), within the noise of the CIF reader
(matsci-parse instead of pymatgen, up to 2e-3 in four structures).

## Where the browser differs

Measured on all 33,142 MC3D structures (`test-suite`, step `oximachine` on
`samples/sample.txt`), app vs Python on the same parsed input, each app site
paired with the Python site of the same element with the closest features:

| | agree |
|---|---:|
| accepted / rejected | 33,137 |
| primitive cell size | 33,095 (99.87%) |
| oxidation states of the metal sites | 32,942 (99.41%) |
| probabilities (1e-9) and base-model votes | 27,834 (84.00%) |
| all 116 features (1e-6) | 22,777 (68.74%) |

349 of 252,969 metal sites (0.14%) get another oxidation state. The 5
structures accepted by one side only are rejected by Python ("featurization
failed: need at least one array to concatenate") and predicted by the app.

The differences come from three places, none of which can be reproduced
exactly:

1. **Primitive cell (the largest difference).** Python uses pymatgen's
   `get_primitive_structure(tolerance=0.25)`, which keeps the input
   positions (averaged over translation-equivalent sites) in the input's
   site order. The app uses matsci-parse's `getSymmetry().primitive` (moyo,
   symprec 0.1), whose positions are symmetry-refined and whose sites are in
   canonical order. Both change the features: refined positions move every
   distance slightly, and the featurizer computes only the first metal site
   of each symmetry orbit, so the site order picks which site represents
   the orbit. Most of the feature and probability differences in the table
   come from this. For nearly symmetric structures the two tolerances can
   also choose different cells (42 in 33,142). The app's cell is not
   Niggli-reduced as pymatgen's is, which only changes how it is displayed
   and downloaded. Site labels (`Fe a`, `Fe b`, ...) follow the canonical
   order, so they can differ from labels of the legacy service.

   Reproducing pymatgen's unrefined cell (averaging the input positions
   with moyo's `prim_std_linear` / `mapping_std_prim`, about 45 lines) and
   featurizing in pymatgen's order brings oxidation states to 99.86% (43
   sites), probabilities to 99.28% and features to 98.68%; it was not kept
   to rely on matsci-parse alone. Adding an unrefined option to matsci-parse's
   `getSymmetry` would allow it.

2. **`body-centered cubic CN_8`.** This CrystalNN order parameter sums over
   pairs of neighbours in their listed order (`j < k`), so it depends on the
   order of neighbours with equal weights. In Python that is the order qhull
   lists the Voronoi faces in; the app has its own order. About 15 in 1000
   structures, already noted for ENATUJ in `backend/README.md`.

3. **Zero-area Voronoi faces.** For high-symmetry cells, qhull (via
   pymatgen's VoronoiNN) reports some neighbours with faces of (numerically)
   zero area, and does so inconsistently: two symmetry-equivalent sites can
   get different numbers of them. Python counts them as neighbours, which
   changes the maximum/minimum local-difference features and CrystalNN's
   solid-angle/area weights; the app's Voronoi cells have no zero-area faces.
   About 5 in 1000 structures, including a changed prediction
   (`mc3d-66151`: one Pt site II in the app, III in Python).

MC3D structures are inorganic, outside the MOF training set, so these
predictions are not meaningful in themselves; the 72 MOF structures of the
legacy service show none of these differences beyond the CIF-reader noise.

## Kept from the Python implementation on purpose

- The featurizer computes the first metal site of each symmetry orbit
  (symprec 0.01) and gives its features to the others, as
  oximachine_featurizer does. Some order parameters differ noticeably
  between symmetry-equivalent sites (0.40 vs 0.49 for two Ir sites in one
  MC3D structure), so computing every site would change results.
- Site labels skip "k", "C" and "W", as the legacy service did.
- Oxidation states 7 and 8 never win (the estimators were trained on 1-6),
  and their sites have no SHAP values.
