// Downloads of the primitive cell with the predictions: matsci-parse's CIF and
// extended XYZ of the (already canonical, see compute.js) primitive cell, with
// the metal sites' oxidation states, probabilities and base-model agreement added.

import { toCIF, toXYZ } from "matsci-parse";

const charge = (state) => `${Math.abs(state)}${state < 0 ? "-" : "+"}`;

/** The primitive cell, each site with its prediction (or undefined). */
function withPredictions(result) {
  const predicted = new Map(result.sites.map((s) => [s.site_index, s]));
  const { sites, ...rest } = result.primitive_structure;
  return { ...rest, sites: sites.map((site, i) => ({ ...site, prediction: predicted.get(i) })) };
}

/**
 * CIF with the predicted oxidation states as typed species (Cu2+, with
 * _atom_type_oxidation_number, as pymatgen, VESTA, ... read them), and the
 * oxiMACHINE label, probability and agreement of each metal site as
 * _atom_site_oximachine_* columns ("." for the other atoms).
 */
export function predictionsCIF(result) {
  const structure = withPredictions(result);
  const lines = toCIF(structure).split("\n");
  if (!structure.sites.some((s) => s.prediction)) return lines.join("\n");

  const first = lines.indexOf("_atom_site_fract_z") + 1;
  const types = new Map(); // type symbol -> oxidation state
  structure.sites.forEach(({ prediction: p }, i) => {
    const [label, symbol, ...coords] = lines[first + i].split(" ");
    if (!p) {
      lines[first + i] = [label, symbol, ...coords, ".", ".", "."].join(" ");
      return;
    }
    const type = `${symbol}${charge(p.oxidation_state)}`;
    types.set(type, p.oxidation_state);
    lines[first + i] = [label, type, ...coords, `'${p.label}'`, p.probability, p.agreement].join(" ");
  });

  const atomSiteLoop = first - 6; // loop_ and the five _atom_site_ names
  return [
    ...lines.slice(0, atomSiteLoop),
    "loop_",
    "_atom_type_symbol",
    "_atom_type_oxidation_number",
    ...[...types].map(([type, state]) => `${type} ${state}`),
    "",
    ...lines.slice(atomSiteLoop, first),
    "_atom_site_oximachine_label",
    "_atom_site_oximachine_probability",
    "_atom_site_oximachine_agreement",
    ...lines.slice(first),
  ].join("\n");
}

/**
 * Extended XYZ with three per-atom columns: oxidation_state (0: not a
 * predicted metal site), probability and agreement (nan when not predicted).
 */
export function predictionsXYZ(result) {
  const structure = withPredictions(result);
  const [count, header, ...atoms] = toXYZ(structure).split("\n");
  const columns = ":oxidation_state:I:1:probability:R:1:agreement:R:1";
  return [
    count,
    header.replace(/Properties=(\S+)/, (_, p) => `Properties=${p}${columns}`),
    ...atoms.map((line, i) => {
      const p = structure.sites[i].prediction;
      return p ? `${line} ${p.oxidation_state} ${p.probability} ${p.agreement}` : `${line} 0 nan nan`;
    }),
  ].join("\n");
}
