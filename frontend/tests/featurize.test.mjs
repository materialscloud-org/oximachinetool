// The JS featurizer reproduces the legacy feature matrices of the 72
// precomputed structures (backend/tests/golden), from the CIFs as the app
// reads them (matsci-parse).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fromCIF, isDisordered, toOrdered } from "matsci-parse";

import { featurizeStructure } from "../src/OxiMachine/features/featurize.js";

const GOLDEN = new URL("../../backend/tests/golden/", import.meta.url);
const NAMES = readdirSync(new URL("structures/", GOLDEN)).map((f) => f.replace(/\.cif$/, ""));

// matsci-parse and pymatgen read slightly different coordinates from these
// CIFs, and CrystalNN rounds its weights to 3 decimals, so a few small
// CrystalNN features move (they match to 1e-11 from pymatgen's coordinates).
// ENATUJ also differs in the Python backend (see backend/README.md).
const DRIFT = { ENATUJ: 2e-5, HAWVUZ: 3e-4, MIFQOJ: 2e-3, SIYXIH: 1e-5 };

/** Pairs each row of x with its closest row of ref: the CIF readers may order the sites differently. */
function pairUp(x, ref) {
  const dist = (a, b) => a.reduce((s, v, j) => s + Math.abs(v - b[j]), 0);
  const left = [...ref];
  return x.map((row) => {
    let best = 0;
    left.forEach((r, i) => dist(row, r) < dist(row, left[best]) && (best = i));
    return [row, left.splice(best, 1)[0]];
  });
}

for (const name of NAMES) {
  test(name, () => {
    const structure = fromCIF(readFileSync(new URL(`structures/${name}.cif`, GOLDEN), "utf8"));
    if (isDisordered(structure)) {
      assert.throws(() => toOrdered(structure)); // the backend rejects these too
      return;
    }
    const golden = JSON.parse(readFileSync(new URL(`precomputed/${name}.json`, GOLDEN), "utf8"));
    const { x } = featurizeStructure(structure);
    assert.equal(x.length, golden.feature_array.length);
    const tol = DRIFT[name] ?? 1e-6;
    for (const [a, b] of pairUp(x, golden.feature_array)) {
      a.forEach((v, j) => assert.ok(Math.abs(v - b[j]) <= tol, `${golden.feature_names[j]}: ${v} vs ${b[j]}`));
    }
  });
}
