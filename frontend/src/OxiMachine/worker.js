// Runs compute() off the main thread. The model (~4.8 MB gzip) is fetched on
// the first request and kept for the next ones.
import { compute } from "./compute.js";
import { fetchModel } from "./model.js";

let model = null;

self.onmessage = async ({ data: { id, structure, approximateShap } }) => {
  try {
    model ??= fetchModel(`${import.meta.env.BASE_URL}model/`).catch((err) => {
      model = null; // retry the download next time
      throw err;
    });
    self.postMessage({ id, result: await compute(structure, approximateShap, await model) });
  } catch (err) {
    self.postMessage({ id, error: err.message ?? String(err) });
  }
};
