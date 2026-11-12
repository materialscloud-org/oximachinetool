// Element data of the features, from matsci-parse's periodic table where it
// has the same values: as pymatgen has it (CrystalNN, Element.is_metal), and
// matminer's MagpieData (as oximachine_featurizer uses it) for Z 1-94
// (tests/magpie.test.mjs pins every MAGPIE value to MagpieData).
// TODO: migrate MendeleevNumber, GSbandgap and the valence-electron counts to
// matsci-parse/periodictable, then drop them here.

import {
  covalentRadii,
  electronegativity,
  elementCategories,
  elementGroups,
  elementPeriods,
  getElectronConfigSemantic,
  SymbolToAtomicNumber,
} from "matsci-parse/periodictable";

// pymatgen
/** Element.X, Pauling electronegativity (none for He, Ne, Ar: NaN in arithmetic). */
export const ELECTRONEGATIVITY = electronegativity;

/** CovalentRadius.radius (Å, Cordero 2008): pymatgen takes sp3 carbon and low-spin Mn, Fe, Co. */
export const COVALENT_RADIUS = { ...covalentRadii, C: 0.73, Mn: 1.5, Fe: 1.42, Co: 1.38 };

const METAL_CATEGORIES = new Set([
  "alkali metal",
  "alkaline earth metal",
  "transition metal",
  "post-transition metal",
  "lanthanide",
  "actinide",
]);

/** Element.is_metal, up to Pu (the Magpie data of the features): pymatgen does not count Po. */
export const METALS = new Set(
  Object.keys(elementCategories).filter(
    (s) => METAL_CATEGORIES.has(elementCategories[s]) && s !== "Po" && SymbolToAtomicNumber.get(s) <= 94,
  ),
);

// Magpie
const MENDELEEV_NUMBER = {
  H: 92, He: 98, Li: 1, Be: 67, B: 72, C: 77, N: 82, O: 87, F: 93, Ne: 99,
  Na: 2, Mg: 68, Al: 73, Si: 78, P: 83, S: 88, Cl: 94, Ar: 100, K: 3, Ca: 7,
  Sc: 11, Ti: 43, V: 46, Cr: 49, Mn: 52, Fe: 55, Co: 58, Ni: 61, Cu: 64, Zn: 69,
  Ga: 74, Ge: 79, As: 84, Se: 89, Br: 95, Kr: 101, Rb: 4, Sr: 8, Y: 12, Zr: 44,
  Nb: 47, Mo: 50, Tc: 53, Ru: 56, Rh: 59, Pd: 62, Ag: 65, Cd: 70, In: 75, Sn: 80,
  Sb: 85, Te: 90, I: 96, Xe: 102, Cs: 5, Ba: 9, La: 13, Ce: 15, Pr: 17, Nd: 19,
  Pm: 21, Sm: 23, Eu: 25, Gd: 27, Tb: 29, Dy: 31, Ho: 33, Er: 35, Tm: 37, Yb: 39,
  Lu: 41, Hf: 45, Ta: 48, W: 51, Re: 54, Os: 57, Ir: 60, Pt: 63, Au: 66, Hg: 71,
  Tl: 76, Pb: 81, Bi: 86, Po: 91, At: 97, Rn: 103, Fr: 6, Ra: 10, Ac: 14, Th: 16,
  Pa: 18, U: 20, Np: 22, Pu: 24,
};

/** Ground-state band gap (eV) of the elemental solid; 0 for the others. */
const BAND_GAP = {
  H: 7.853, He: 18.098, B: 1.524, C: 4.496, N: 6.437, F: 1.97, Ne: 13.088,
  Si: 0.773, P: 1.625, S: 2.202, Cl: 2.493, Ar: 9.26, Ge: 0.383, Se: 0.799,
  Br: 1.457, Kr: 7.535, Te: 0.464, I: 1.062, Xe: 6.456,
};

// Magpie fills the missing noble gases with 1.7151... and differs for these lanthanides
const MAGPIE_ELECTRONEGATIVITY = {
  ...electronegativity,
  He: 1.7151020408163267, Ne: 1.7151020408163267, Ar: 1.7151020408163267, Rn: 1.7151020408163267,
  Pm: 1.155, Eu: 1.185, Tb: 1.21, Yb: 1.26,
};

const CAPACITY = { s: 2, p: 6, d: 10, f: 14 };

/** Electrons beyond the noble-gas core per subshell type, and the empty places of the occupied ones. */
function valence(symbol) {
  const n = { s: 0, p: 0, d: 0, f: 0 };
  const occupied = new Set();
  // "[Ar] 3d6 4s2": the core in brackets does not match
  for (const [, l, count] of getElectronConfigSemantic(symbol).matchAll(/\d([spdf])(\d+)/g)) {
    n[l] += Number(count);
    occupied.add(l);
  }
  const unfilled = (l) => (occupied.has(l) ? CAPACITY[l] - n[l] : 0);
  return {
    NsValence: n.s, NpValence: n.p, NdValence: n.d, NfValence: n.f,
    NValence: n.s + n.p + n.d + n.f,
    NsUnfilled: unfilled("s"), NpUnfilled: unfilled("p"), NdUnfilled: unfilled("d"), NfUnfilled: unfilled("f"),
    NUnfilled: unfilled("s") + unfilled("p") + unfilled("d") + unfilled("f"),
  };
}

export const MAGPIE = Object.fromEntries(
  Object.keys(MENDELEEV_NUMBER).map((symbol) => [
    symbol,
    {
      Z: SymbolToAtomicNumber.get(symbol),
      MendeleevNumber: MENDELEEV_NUMBER[symbol],
      Column: elementGroups[symbol],
      Row: elementPeriods[symbol],
      Electronegativity: MAGPIE_ELECTRONEGATIVITY[symbol],
      ...valence(symbol),
      GSbandgap: BAND_GAP[symbol] ?? 0,
    },
  ]),
);
