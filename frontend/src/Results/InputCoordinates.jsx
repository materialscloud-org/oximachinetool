// "Please double-check that the parser worked": the parsed input cell and
// coordinates, as the old visualizer page showed them.

function cartesian(frac, basis) {
  return [0, 1, 2].map(
    (j) => frac[0] * basis[j] + frac[1] * basis[3 + j] + frac[2] * basis[6 + j],
  );
}

function CoordTable({ title, header, rows }) {
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-slate-800">{title}</h4>
      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-right font-mono text-xs">
          <thead className="sticky top-0 bg-slate-50 font-sans">
            <tr>
              {header.map((h) => (
                <th key={h} className="px-3 py-1.5 text-center font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([label, ...xyz], i) => (
              <tr key={i}>
                <td className="px-3 py-1 text-center font-sans">{label}</td>
                {xyz.map((x, k) => (
                  <td key={k} className="px-3 py-1">
                    {x.toFixed(10)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InputCoordinates({ structure }) {
  const basis = structure.lattice.basis.data;
  const cell = [0, 1, 2].map((r) => [
    <>
      v<sub>{r + 1}</sub>
    </>,
    ...basis.slice(r * 3, r * 3 + 3),
  ]);
  const scaled = structure.sites.map((s) => [s.species.symbol, ...s.frac]);
  const cart = structure.sites.map((s) => [
    s.species.symbol,
    ...cartesian(s.frac, basis),
  ]);

  return (
    <div className="space-y-4">
      <CoordTable title="Input cell vectors (Å)" header={["v", "x", "y", "z"]} rows={cell} />
      <CoordTable
        title="Input atom coordinates (scaled)"
        header={["Element", "r₁", "r₂", "r₃"]}
        rows={scaled}
      />
      <CoordTable
        title="Input atom coordinates (Cartesian, Å)"
        header={["Element", "x", "y", "z"]}
        rows={cart}
      />
    </div>
  );
}
