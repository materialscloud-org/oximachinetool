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

Measured on 1000 random MC3D structures (`test-suite`, step `oximachine`),
app vs Python on the same parsed input:

| | agree |
|---|---:|
| accepted / rejected | 1000 |
| primitive cell size | 997 |
| metal sites, labels, oxidation states | 996 |
| probabilities (1e-9) and base-model votes | 988 |
| all 116 features (1e-6) | 978 |

The remaining differences come from three places, none of which can be
reproduced exactly:

1. **Primitive cell.** Python uses pymatgen's
   `get_primitive_structure(tolerance=0.25)`; the app finds the primitive
   cell with moyo (symprec 0.1, via matsci-parse's `getSymmetry`), whose
   atoms are moved to their symmetry-refined positions; pymatgen keeps the
   input positions, averaged over the sites it merges. The refined positions
   shift the features slightly: the oxidation states are the same for the
   legacy MOFs (50 of 50 checked), but differ for about 1% of MC3D
   structures (3 of 300 checked; the agreement table above predates this
   change). For nearly symmetric structures the two tolerances can also
   choose different cells (3 in 1000). The app's cell is not Niggli-reduced
   as pymatgen's is, which only changes how it is displayed and downloaded.

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
   About 5 in 1000 structures, including the only changed prediction seen
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
