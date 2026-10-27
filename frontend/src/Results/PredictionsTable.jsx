import { agreementColor, csdUrl, toRoman } from "../utils";

function Th({ children, title }) {
  return (
    <th className="px-3 py-2 font-semibold text-slate-700" title={title}>
      {children}
      {title && <sup className="ml-0.5 cursor-help text-slate-400">[?]</sup>}
    </th>
  );
}

export default function PredictionsTable({ sites }) {
  if (sites.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        No metal sites were found in this structure, so there is nothing to
        predict.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs">
          <tr>
            <Th>Metal site</Th>
            <Th>Oxidation state</Th>
            <Th title="Share of the base estimators (kNN, gradient boosting, logistic regression, SVM) agreeing with the ensemble prediction.">
              Confidence
            </Th>
            <Th>Probability</Th>
            <Th title="The base estimators are kNN, gradient boosting, logistic regression and SVM.">
              Base models
            </Th>
            <Th title="Closest training structures, by Euclidean distance in feature space.">
              Closest training structures
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sites.map((site) => (
            <tr key={site.label} className="even:bg-slate-50/50">
              <td className="px-3 py-2 font-medium">{site.label}</td>
              <td className="px-3 py-2 text-base font-semibold">
                {toRoman(site.oxidation_state)}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-between text-[10px] uppercase text-slate-400">
                  <span>low</span>
                  <span>high</span>
                </div>
                <div className="h-2 w-28 overflow-hidden rounded bg-slate-200">
                  <div
                    className={`h-full ${agreementColor(site.agreement)}`}
                    style={{ width: `${site.agreement}%` }}
                  />
                </div>
              </td>
              <td className="px-3 py-2 font-mono">
                {site.probability.toFixed(3)}
              </td>
              <td className="px-3 py-2">
                {site.base_model_predictions.map(toRoman).join(", ")}
              </td>
              <td className="px-3 py-2">
                {site.nearest_training_structures.map((refcode, i) => (
                  <span key={refcode}>
                    {i > 0 && ", "}
                    <a href={csdUrl(refcode)} target="_blank" rel="noreferrer">
                      {refcode}
                    </a>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
