// The browser model reproduces the Python model (backend/oximachine_api) on
// the feature matrices of the 72 legacy precomputed results: reference
// outputs from backend/scripts/build_web_reference.py.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

import { loadModel } from "../src/OxiMachine/model.js";

const MODEL = new URL("../public/model/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", MODEL)));
const arrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const blob = gunzipSync(readFileSync(new URL("model.bin.gz", MODEL)));
const fetchChunk = async (c) => arrayBuffer(gunzipSync(readFileSync(new URL(`rows/${c}.bin.gz`, MODEL))));
const model = loadModel(manifest, arrayBuffer(blob), fetchChunk);
const reference = JSON.parse(gunzipSync(readFileSync(new URL("reference.json.gz", import.meta.url))));

const close = (a, b, tol, what) => a.forEach((v, j) => assert.ok(Math.abs(v - b[j]) <= tol, `${what} ${j}: ${v} vs ${b[j]}`));

for (const [name, sites] of Object.entries(reference)) {
  test(name, async () => {
    for (const ref of sites) {
      const p = await model.predict(ref.x);
      assert.equal(p.oxidationState, ref.oxidation_state);
      assert.ok(Math.abs(p.probability - ref.probability) <= 1e-12, `probability ${p.probability} vs ${ref.probability}`);
      assert.deepEqual(p.basePredictions, ref.base_model_predictions);
      assert.equal(p.agreement, ref.agreement);
      assert.deepEqual(await model.nearestTrainingStructures(ref.x), ref.nearest_training_structures);
      assert.deepEqual(model.percentiles(ref.x), ref.percentiles);
      for (const approximate of [true, false]) {
        const shap = model.shap(ref.x, p.oxidationState, approximate);
        const values = approximate ? ref.shap_approximate : ref.shap_exact;
        if (values === null) {
          assert.equal(shap, null);
          continue;
        }
        assert.equal(shap.base_value, ref.shap_base_value);
        close(shap.values, values, 1e-12, approximate ? "approximate SHAP" : "exact SHAP");
      }
    }
  });
}
