// Development-only stand-in for the backend (enabled with `pnpm dev:mock`).
// Returns the right *shape* for the input structure; every number is
// placeholder data, and the UI shows a banner saying so.

import { toPymatgen } from "matsci-parse";

const METALS = new Set(
  "Li Be Na Mg Al K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Th U Pu".split(
    " ",
  ),
);

const FEATURE_NAMES = [
  "column",
  "row",
  "valenceelectrons",
  "octahedral CN_6",
  "tetrahedral CN_4",
  "mean local difference in Pauling electronegativity",
];
const CATEGORIES = ["metal", "metal", "metal", "geometry", "geometry", "chemistry"];

export async function mockCompute(structure) {
  await new Promise((r) => setTimeout(r, 600));
  const sites = structure.sites
    .map((site, i) => ({ symbol: site.species?.symbol, i }))
    .filter(({ symbol }) => METALS.has(symbol))
    .map(({ symbol, i }, n) => ({
      label: `${symbol} ${String.fromCharCode(97 + (n % 26))}`,
      element: symbol,
      site_index: i,
      oxidation_state: 2,
      probability: 0.5,
      base_model_predictions: [2, 2, 2, 3],
      agreement: 75,
      nearest_training_structures: ["ABCDEF"],
      shap: {
        base_value: 0.25,
        values: FEATURE_NAMES.map((_, k) => (k % 2 ? -0.05 : 0.08)),
      },
      features: FEATURE_NAMES.map((name, k) => ({
        name,
        value: k,
        percentile: (k * 17) % 100,
        category: CATEGORIES[k],
      })),
    }));

  return {
    mock: true,
    model_version: "mock",
    compute_time: 0.6,
    warning: null,
    primitive_structure: toPymatgen(structure),
    feature_names: FEATURE_NAMES,
    sites,
  };
}
