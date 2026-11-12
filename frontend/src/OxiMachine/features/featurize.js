// The 116 features of each metal site, as backend/oximachine_api/features.py
// featurize_structure (oximachine_featurizer with the "mof_chemarxiv"
// feature set): 60 local property stats, 7 metal features, 49 CrystalNN.

import { crystalNNFingerprint } from "./crystal_nn.js";
import { localPropertyStats } from "./local_property_stats.js";
import { MAGPIE, METALS } from "./elementalData.js";

const ROW_SIZES = [2, 8, 8, 18, 18, 32, 32];

/** Element.row as in pymatgen 2020, which the model was trained with:
 *  lanthanides are row 8 and actinides row 9. */
function legacyRow(z) {
  if (z >= 57 && z <= 71) return 8;
  if (z >= 89 && z <= 103) return 9;
  let total = 0;
  for (let i = 0; i < ROW_SIZES.length; i++) {
    total += ROW_SIZES[i];
    if (total >= z) return i + 1;
  }
  throw new Error(`No row for Z = ${z}`);
}

/** Element.group as in pymatgen 2020: f-block numbered 3-17 across the block. */
function legacyGroup(z) {
  if (z === 1) return 1;
  if (z === 2) return 18;
  if (z <= 18) {
    if ((z - 2) % 8 === 0) return 18;
    if ((z - 2) % 8 <= 2) return (z - 2) % 8;
    return 10 + ((z - 2) % 8);
  }
  if (z <= 54) return (z - 18) % 18 === 0 ? 18 : (z - 18) % 18;
  if ((z - 54) % 32 === 0) return 18;
  if ((z - 54) % 32 >= 18) return ((z - 54) % 32) - 14;
  return (z - 54) % 32;
}

/** column, row, valenceelectrons, diffto18electrons, sunfilled, punfilled, dunfilled */
function metalFeatures(symbol) {
  const e = MAGPIE[symbol];
  return [
    legacyGroup(e.Z),
    legacyRow(e.Z),
    e.NValence,
    Math.min(Math.abs(e.NValence - 18), e.NValence),
    e.NsUnfilled,
    e.NpUnfilled,
    e.NdUnfilled,
  ];
}

/**
 * Features of the metal sites of an ordered matsci-parse structure:
 * { x: one row per metal site, metalIndices, metals }.
 *
 * `orbits[i]` names the symmetry orbit of site i (moyo's `orbits`, symprec
 * 0.01 as pymatgen's SpacegroupAnalyzer). Like oximachine_featurizer, the first
 * metal site of an orbit is featurized and the others get its features: some
 * order parameters differ between symmetry-equivalent sites, and the model
 * results depend on which one is computed.
 */
export function featurizeStructure(ordered, orbits = ordered.sites.map((_, i) => i)) {
  // voronoi.js wants fractional coordinates in [0, 1); keep the site order
  const structure = {
    ...ordered,
    sites: ordered.sites.map((site) => ({ ...site, frac: site.frac.map((f) => f - Math.floor(f)) })),
  };
  const metalIndices = [];
  structure.sites.forEach((site, i) => METALS.has(site.species.symbol) && metalIndices.push(i));
  const metals = metalIndices.map((i) => structure.sites[i].species.symbol);
  const done = new Map(); // orbit -> features
  const x = metalIndices.map((i, n) => {
    if (!done.has(orbits[i])) {
      done.set(orbits[i], [
        ...localPropertyStats(structure, i),
        ...metalFeatures(metals[n]),
        ...crystalNNFingerprint(structure, i),
      ]);
    }
    return done.get(orbits[i]);
  });
  return { x, metalIndices, metals };
}
