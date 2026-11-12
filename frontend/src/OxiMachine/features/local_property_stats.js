// Local property stats of a site, porting
// oximachine_featurizer.featurizer_local_property.LocalPropertyStatsNew
// (preset "interpretable"): for 15 Magpie properties, the differences
// p_n - p_0 between the Voronoi neighbours n of the site and the site,
// weighted by facet area. 60 values, in the featurizer's order: all
// |difference| means, then all signed means, then maxima, then minima.

import { MAGPIE } from "./elementalData.js";
import { voronoiNeighbours } from "./voronoi.js";

const PROPERTIES = [
  "MendeleevNumber",
  "Column",
  "Row",
  "Electronegativity",
  "NsValence",
  "NpValence",
  "NdValence",
  "NfValence",
  "NValence",
  "NsUnfilled",
  "NpUnfilled",
  "NdUnfilled",
  "NfUnfilled",
  "NUnfilled",
  "GSbandgap",
];

const symbol = (structure, i) => structure.sites[i].species.symbol;

export function localPropertyStats(structure, siteIndex) {
  const neighbours = voronoiNeighbours(structure, siteIndex);
  const total = neighbours.reduce((acc, nn) => acc + nn.weight, 0);
  const me = MAGPIE[symbol(structure, siteIndex)];
  const others = neighbours.map((nn) => MAGPIE[symbol(structure, nn.siteIndex)]);

  const n = PROPERTIES.length;
  const out = new Array(4 * n);
  PROPERTIES.forEach((p, i) => {
    const deltas = others.map((e) => e[p] - me[p]);
    out[i] = deltas.reduce((acc, d, k) => acc + neighbours[k].weight * Math.abs(d), 0) / total;
    out[n + i] = deltas.reduce((acc, d, k) => acc + neighbours[k].weight * d, 0) / total;
    out[2 * n + i] = Math.max(...deltas);
    out[3 * n + i] = Math.min(...deltas);
  });
  return out;
}
