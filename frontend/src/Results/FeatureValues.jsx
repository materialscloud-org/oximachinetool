import { useState } from "react";

import { percentileColor } from "../utils";

const COLUMNS = [
  { key: "name", label: "Feature" },
  { key: "percentile", label: "Value (percentile)" },
  { key: "category", label: "Category" },
];

function SiteFeatureTable({ site }) {
  // The original DataTable sorted by percentile, descending.
  const [sort, setSort] = useState({ key: "percentile", desc: true });

  const rows = [...site.features].sort((a, b) => {
    const cmp =
      typeof a[sort.key] === "number"
        ? a[sort.key] - b[sort.key]
        : String(a[sort.key]).localeCompare(String(b[sort.key]));
    return sort.desc ? -cmp : cmp;
  });

  const toggleSort = (key) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "percentile" }));

  return (
    <div>
      <h4 className="mb-1 font-semibold text-slate-800">{site.label}</h4>
      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="cursor-pointer select-none px-3 py-2 font-semibold text-slate-700"
                  title={
                    key === "percentile"
                      ? "A percentile of 80 means 80% of the training set has a lower value for this feature."
                      : undefined
                  }
                >
                  {label}
                  {sort.key === key && (sort.desc ? " ▾" : " ▴")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((f) => (
              <tr key={f.name}>
                <td className="px-3 py-1.5">{f.name}</td>
                <td className="px-3 py-1.5 font-mono">
                  {f.value.toFixed(3)}{" "}
                  <span style={{ color: percentileColor(f.percentile) }}>
                    ({f.percentile})
                  </span>
                </td>
                <td className="px-3 py-1.5">{f.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FeatureValues({ sites }) {
  return (
    <div className="space-y-6">
      {sites.map((site) => (
        <SiteFeatureTable key={site.label} site={site} />
      ))}
    </div>
  );
}
