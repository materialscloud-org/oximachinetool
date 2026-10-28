import "./index.css";
import MaterialsCloudHeader from "mc-react-header";
import { useEffect, useRef, useState } from "react";

import InfoAccordions from "./AccordionContent";
import { computeOxidationStates } from "./api";
import CrystalUpload from "./FileUpload";
import Results from "./Results";
import { MAX_NUMBER_OF_ATOMS } from "./utils";

import { McAppHeader, McShareButton, toStructureShare } from "mc-react-library";

// kv-store for share links. .env.development points `pnpm dev` at the dev
// store; unset (production builds) means the Materials Cloud production store.
const KV_URL = import.meta.env.VITE_KV_URL;

function App() {
  // { structure, fileName, format, shareId? }
  const [loaded, setLoaded] = useState(null);
  const [approximateShap, setApproximateShap] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  // A newer request cancels the one in flight.
  const compute = (structure, approximate) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResult(null);
    setError(null);
    setComputing(true);
    computeOxidationStates(structure, {
      approximateShap: approximate,
      signal: controller.signal,
    })
      .then(setResult)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message ?? String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setComputing(false);
      });
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleStructureParsed = (parsed) => {
    setLoaded(parsed);
    compute(parsed.structure, approximateShap);
  };

  const handleApproximateChange = (approximate) => {
    setApproximateShap(approximate);
    if (loaded) compute(loaded.structure, approximate);
  };

  return (
    <>
      <MaterialsCloudHeader
        activeSection="work"
        breadcrumbsPath={[
          { name: "Work", link: "https://www.materialscloud.org/work" },
          { name: "Tools", link: "https://www.materialscloud.org/work/tools" },
          { name: "oxiMACHINE", link: null },
        ]}
      />

      <main className="min-h-screen bg-[aliceblue] pb-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="overflow-hidden bg-white p-4 shadow-sm">
            <McAppHeader
              title={
                <>
                  <span className="font-bold">oxiMACHINE</span>: predicting
                  oxidation states for MOFs
                </>
              }
              logo={`${import.meta.env.BASE_URL}oximachine_logo.png`}
              logoAlt="oxiMACHINE logo"
              dois={[
                {
                  doi: "10.26434/chemrxiv.11604129.v1",
                  label: "ChemRxiv",
                  color: "#a2e5b7",
                },
              ]}
            />
            <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
              <div className="space-y-3">
                <InfoAccordions />

                <CrystalUpload
                  kvUrl={KV_URL}
                  onStructureParsed={handleStructureParsed}
                />

                <label className="flex items-start gap-2 pt-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={approximateShap}
                    onChange={(e) => handleApproximateChange(e.target.checked)}
                  />
                  <span>
                    Approximate feature importance (fast).{" "}
                    <span className="text-slate-500">
                      Untick for exact SHAP values, which can be much slower.
                      Results remain biased by the background data (a k-means
                      summary of the training set) and only consider the
                      extra-trees model.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mx-auto max-w-6xl px-6 py-4 sm:px-10">
              {loaded && loaded.structure.sites.length > MAX_NUMBER_OF_ATOMS && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  This cell has {loaded.structure.sites.length} atoms. The
                  limit is {MAX_NUMBER_OF_ATOMS} atoms in the primitive cell,
                  so the calculation will fail unless the primitive cell is
                  smaller.
                </p>
              )}

              {computing && (
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  Calculating features, predictions and interpretations for{" "}
                  {loaded?.fileName}…
                </p>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              {result && (
                <Results
                  inputStructure={loaded.structure}
                  result={result}
                  fileName={loaded.fileName}
                />
              )}
            </div>
            <McShareButton
              kvUrl={KV_URL}
              data={loaded}
              toDocument={toStructureShare}
              shareId={loaded?.shareId}
              className="mx-auto max-w-6xl px-6 sm:px-10"
            />
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
