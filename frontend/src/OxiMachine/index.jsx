import { useEffect, useState } from "react";
import { McloudSpinner, McResults } from "mc-react-library";

import { MAX_NUMBER_OF_ATOMS } from "../utils";
import Results from "./Results";

let worker = null;
let nextId = 0;

/** compute.js in a Web Worker. Aborting drops the result, not the work. */
function computeInWorker(structure, approximateShap, signal) {
  worker ??= new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const done = () => worker.removeEventListener("message", onMessage);
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      done();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.addEventListener("message", onMessage);
    signal.addEventListener("abort", () => {
      done();
      reject(new DOMException("Aborted", "AbortError"));
    });
    worker.postMessage({ id, structure, approximateShap });
  });
}

/**
 * The feature-importance option, the oxidation states of `structure`
 * (computed in the browser) and their results. `fileName` names the
 * structure.
 */
export default function OxiMachine({ structure, fileName, className = "" }) {
  const [approximateShap, setApproximateShap] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState(null);
  // { structure, fileName, data }: the result belongs to that structure (the
  // previous one stays, dimmed, while the next is computed)
  const [result, setResult] = useState(null);

  // A newer request cancels the one in flight.
  useEffect(() => {
    if (!structure) return;
    const controller = new AbortController();

    setError(null);
    setComputing(true);
    computeInWorker(structure, approximateShap, controller.signal)
      .then((data) => setResult({ structure, fileName, data }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setResult(null);
        setError(err.message ?? String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setComputing(false);
      });
    return () => controller.abort();
  }, [structure, fileName, approximateShap]);

  return (
    <div className={className}>
      <div className="mx-auto max-w-5xl px-6 sm:px-10">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={approximateShap}
            onChange={(e) => setApproximateShap(e.target.checked)}
          />
          <span>
            Approximate feature importance (fast).{" "}
            <span className="text-slate-500">
              Untick for exact SHAP values (TreeSHAP), which are slower. Only
              the extra-trees model is explained.
            </span>
          </span>
        </label>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-4 sm:px-10">
        {structure && structure.sites.length > MAX_NUMBER_OF_ATOMS && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This cell has {structure.sites.length} atoms. The limit is{" "}
            {MAX_NUMBER_OF_ATOMS} atoms in the primitive cell, so the
            calculation will fail unless the primitive cell is smaller.
          </p>
        )}

        {computing && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <McloudSpinner className="w-6 shrink-0" />
            Calculating features, predictions and interpretations for {fileName}
            …
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <McResults busy={computing} resultKey={result}>
          {result && (
            <Results
              inputStructure={result.structure}
              result={result.data}
              fileName={result.fileName}
            />
          )}
        </McResults>
      </div>
    </div>
  );
}
