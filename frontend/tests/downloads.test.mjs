// The downloads carry the predictions on the right atoms of the primitive cell,
// canonical as compute.js makes it (pymatgen and ASE read them back; checked
// when this was written).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLattice, fromCIF } from "matsci-parse";

import { predictionsCIF, predictionsXYZ } from "../src/OxiMachine/downloads.js";

const site = (symbol, frac) => ({ species: { symbol }, frac: new Float64Array(frac) });
const result = {
  primitive_structure: {
    lattice: createLattice([5, 5, 5]),
    sites: [site("Cu", [0, 0, 0]), site("Cu", [0.5, 0.5, 0.5]), site("O", [0.25, 0.25, 0.25])],
  },
  sites: [
    { site_index: 1, label: "Cu a", oxidation_state: 1, probability: 0.6, agreement: 75 },
    { site_index: 0, label: "Cu b", oxidation_state: 2, probability: 0.9, agreement: 100 },
  ],
};

test("CIF: typed species, oximachine columns", () => {
  const cif = predictionsCIF(result);
  assert.match(cif, /_atom_type_oxidation_number\nCu2\+ 2\nCu1\+ 1\n/);
  assert.match(cif, /_atom_site_fract_z\n_atom_site_oximachine_label\n_atom_site_oximachine_probability\n_atom_site_oximachine_agreement\n/);
  const rows = cif.split("\n").slice(-3).map((r) => r.split(" "));
  assert.deepEqual(rows.map((r) => [r[1], ...r.slice(2, 5).map(Number), ...r.slice(5)]), [
    ["Cu2+", 0, 0, 0, "'Cu", "b'", "0.9", "100"],
    ["Cu1+", 0.5, 0.5, 0.5, "'Cu", "a'", "0.6", "75"],
    ["O", 0.25, 0.25, 0.25, ".", ".", "."],
  ]);
  assert.deepEqual(fromCIF(cif).sites.map((s) => s.species.symbol), ["Cu", "Cu", "O"]);
});

test("extended XYZ: three per-atom columns", () => {
  const [, header, ...atoms] = predictionsXYZ(result).split("\n");
  assert.match(header, /Properties=species:S:1:pos:R:3:oxidation_state:I:1:probability:R:1:agreement:R:1$/);
  assert.deepEqual(atoms.map((a) => a.split(" ")), [
    ["Cu", "0", "0", "0", "2", "0.9", "100"],
    ["Cu", "2.5", "2.5", "2.5", "1", "0.6", "75"],
    ["O", "1.25", "1.25", "1.25", "0", "nan", "nan"],
  ]);
});
