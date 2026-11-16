// structure -> primitive cell -> features -> predictions, nearest training
// structures and feature importance, as backend/oximachine_api/service.py.

import { canonicalize, getNeighbors, getSymmetry, isDisordered } from "matsci-parse";

import { MAX_NUMBER_OF_ATOMS } from "../utils.js";
import { featurizeStructure } from "./features/featurize.js";

const MIN_DISTANCE = 0.5; // Å; closer atoms are treated as overlapping
// pymatgen's get_primitive_structure tolerance is 0.25 Å; at 0.1 moyo finds
// the same primitive cells for the 68 ordered legacy structures.
const SYMPREC = 0.1;

// Site labels of the legacy service (sic: no "k", "C" or "W"), kept so labels
// match previously computed results; numbered beyond its length.
const SITE_LETTERS = "abcdefghijlmnopqrstuvwxyzABZDEFGHIJKLMNOPQRSTUVQXYZ0123456789";
const siteLabel = (element, i) => `${element} ${i < SITE_LETTERS.length ? SITE_LETTERS[i] : i + 1}`;

const RARE_METALS = new Set(["Ag", "Ce", "Er", "Hg", "Nb", "Os", "Pt", "Sn", "Yb", "Pu"]);
const RARE_METAL_WARNING = "Your structure contains an element that is rare in MOFs. The prediction might be wrong.";

async function loadPrimitive(structure) {
  if (isDisordered(structure)) {
    throw new Error("oxiMACHINE only supports ordered structures (no partial occupancies).");
  }
  // Symmetry-refined, unlike pymatgen's get_primitive_structure (see MIGRATION_NOTES.md)
  const primitive = canonicalize((await getSymmetry(structure, SYMPREC)).primitive);
  const n = primitive.sites.length;
  if (n > MAX_NUMBER_OF_ATOMS) {
    throw new Error(
      `Sorry, this online tool is limited to ${MAX_NUMBER_OF_ATOMS} atoms in the primitive cell, while your structure has ${n} atoms.`,
    );
  }
  if (n > 1 && primitive.sites.some((_, i) => getNeighbors(primitive, i, { cutoff: MIN_DISTANCE }).length)) {
    throw new Error(`Sorry, there seem to be overlapping atoms in the input structure (closer than ${MIN_DISTANCE} Å).`);
  }
  return primitive;
}

/** The result shown by Results.jsx (the backend's ComputeResponse). */
export async function compute(structure, approximateShap, model) {
  const start = performance.now();
  const primitive = await loadPrimitive(structure);

  // The featurizer's symmetry orbits (pymatgen's SpacegroupAnalyzer default)
  const { orbits } = (await getSymmetry(primitive, 0.01)).calculationResults;
  let featurized;
  try {
    featurized = featurizeStructure(primitive, orbits);
  } catch (err) {
    throw new Error(
      "Sorry, the featurization failed. Make sure that your structure is not pathological (e.g. containing overlapping atoms).",
      { cause: err },
    );
  }
  const { x, metalIndices, metals } = featurized;

  const sites = await Promise.all(x.map(async (row, i) => {
    const p = await model.predict(row);
    const percentiles = model.percentiles(row);
    return {
      label: siteLabel(metals[i], i),
      element: metals[i],
      site_index: metalIndices[i],
      oxidation_state: p.oxidationState,
      probability: p.probability,
      base_model_predictions: p.basePredictions,
      agreement: p.agreement,
      nearest_training_structures: await model.nearestTrainingStructures(row),
      shap: model.shap(row, p.oxidationState, approximateShap),
      features: row.map((value, j) => ({
        name: model.featureNames[j],
        value,
        percentile: percentiles[j],
        category: model.featureCategories[j],
      })),
    };
  }));

  return {
    model_version: model.version,
    compute_time: (performance.now() - start) / 1000,
    warning: metals.some((m) => RARE_METALS.has(m)) ? RARE_METAL_WARNING : null,
    primitive_structure: primitive,
    feature_names: model.featureNames,
    sites,
  };
}
