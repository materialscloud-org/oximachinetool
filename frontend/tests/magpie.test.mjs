// MAGPIE (built from matsci-parse's periodic table) equals matminer's
// MagpieData for every element and property the features use (magpie.json:
// the values before the switch). Fails if matsci-parse's data changes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MAGPIE } from "../src/OxiMachine/features/elementalData.js";

test("MAGPIE equals MagpieData", () => {
  assert.deepEqual(MAGPIE, JSON.parse(readFileSync(new URL("magpie.json", import.meta.url), "utf8")));
});
