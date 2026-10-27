// Replaces the HTML/JS that shap.force_plot() used to inject: a diverging
// bar chart of the features that move each site's prediction the most.

const TOP_N = 10;

function SiteImportance({ site, featureNames }) {
  if (!site.shap) {
    return (
      <div>
        <h4 className="mb-1 font-semibold text-slate-800">{site.label}</h4>
        <p className="text-xs text-slate-500">
          No feature importance is available for this oxidation state.
        </p>
      </div>
    );
  }
  const contributions = site.shap.values
    .map((value, i) => ({ name: featureNames[i], value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, TOP_N);
  const maxAbs = Math.max(...contributions.map((c) => Math.abs(c.value)), 1e-9);
  const output =
    site.shap.base_value + site.shap.values.reduce((sum, v) => sum + v, 0);

  return (
    <div>
      <h4 className="mb-1 font-semibold text-slate-800">{site.label}</h4>
      <p className="mb-2 text-xs text-slate-500">
        base value {site.shap.base_value.toFixed(3)} → model output{" "}
        {output.toFixed(3)}
      </p>
      <div className="space-y-1">
        {contributions.map(({ name, value }) => {
          const width = `${(Math.abs(value) / maxAbs) * 50}%`;
          return (
            <div key={name} className="grid grid-cols-[minmax(0,1fr)_2fr] items-center gap-2 text-xs">
              <span className="truncate text-right text-slate-700" title={name}>
                {name}
              </span>
              <div className="relative h-4 bg-slate-50">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                <div
                  className={`absolute inset-y-0 ${value >= 0 ? "left-1/2 bg-red-500/80" : "right-1/2 bg-blue-500/80"}`}
                  style={{ width }}
                  title={value.toFixed(4)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FeatureImportance({ sites, featureNames }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        The base value is the average prediction of the model, i.e. what it
        would predict from uninformative features. The bars show the features
        that shift the prediction for each metal site away from the base
        value, towards (red) or away from (blue) the predicted oxidation state.
        With the approximation enabled, these scores are a crude estimate.
      </p>
      {sites.map((site) => (
        <SiteImportance
          key={site.label}
          site={site}
          featureNames={featureNames}
        />
      ))}
    </div>
  );
}
