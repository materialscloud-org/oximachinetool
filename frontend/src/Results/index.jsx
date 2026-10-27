import { useMemo, useState } from "react";
import StructureVisualizer from "mc-react-structure-visualizer";
import { fromPymatgen, toCIF, toXSF } from "matsci-parse";
import { McCopyAccordion, McInfoAccordion } from "mc-react-library";

import FeatureImportance from "./FeatureImportance";
import FeatureValues from "./FeatureValues";
import InputCoordinates from "./InputCoordinates";
import PredictionsTable from "./PredictionsTable";
import { PREPRINT_URL } from "../utils";

export default function Results({ inputStructure, result, fileName }) {
  const [open, setOpen] = useState(null);
  const toggle = (key) => setOpen(open === key ? null : key);

  const primitive = useMemo(
    () => fromPymatgen(result.primitive_structure),
    [result],
  );
  const baseName = (fileName ?? "structure").replace(/\.[^.]+$/, "");

  return (
    <div className="space-y-6">
      {result.mock && (
        <p className="rounded-lg bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-800">
          Mock API: the values below are placeholders, not predictions.
        </p>
      )}

      {result.warning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          {result.warning}
        </p>
      )}

      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Primitive structure
        </h2>
        <p className="mb-2 text-xs text-slate-500">
          Predictions refer to this cell ({primitive.sites.length} atoms).
        </p>
        <div className="h-[480px] w-full">
          {/* MOF cells are large: start from a single cell, as the old JSmol view did. */}
          <StructureVisualizer structure={primitive} initSupercell={[1, 1, 1]} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          Predictions
        </h2>
        <PredictionsTable sites={result.sites} />
      </section>

      {result.sites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Detailed data
          </h2>
          <McInfoAccordion
            title="Feature importance"
            open={open === "importance"}
            onToggle={() => toggle("importance")}
          >
            <FeatureImportance
              sites={result.sites}
              featureNames={result.feature_names}
            />
          </McInfoAccordion>
          <McInfoAccordion
            title="Feature values"
            open={open === "values"}
            onToggle={() => toggle("values")}
          >
            <FeatureValues sites={result.sites} />
          </McInfoAccordion>
          <McInfoAccordion
            title="Parsed input coordinates (please double-check that the parser worked properly)"
            open={open === "input"}
            onToggle={() => toggle("input")}
          >
            <InputCoordinates structure={inputStructure} />
          </McInfoAccordion>
          <McCopyAccordion
            title="Primitive structure (CIF)"
            text={toCIF(primitive)}
            filename={`${baseName}_primitive.cif`}
            open={open === "cif"}
            onToggle={() => toggle("cif")}
          />
          <McCopyAccordion
            title="Primitive structure (XSF)"
            text={toXSF(primitive)}
            filename={`${baseName}_primitive.xsf`}
            open={open === "xsf"}
            onToggle={() => toggle("xsf")}
          />
        </section>
      )}

      <p className="text-xs text-slate-500">
        <span className="font-semibold">Technical info</span>: time spent
        computing features, predictions and interpretation:{" "}
        {result.compute_time.toFixed(3)} s. Model version:{" "}
        {result.model_version}. More information about the features and the
        model can be found in the{" "}
        <a href={PREPRINT_URL} target="_blank" rel="noreferrer">
          preprint on ChemRxiv
        </a>
        .
      </p>
    </div>
  );
}
