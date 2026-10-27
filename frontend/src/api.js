// Client for the oxiMACHINE backend.
//
// Contract (POST /api/compute):
//
// Request body:
//   {
//     structure: <pymatgen Structure.as_dict(), as produced by matsci-parse toPymatgen()>,
//     approximate_shap: boolean,   // crude (fast) SHAP estimate when true
//   }
//
// Response body (200):
//   {
//     model_version: string,
//     compute_time: number,                 // seconds, featurization + prediction + SHAP
//     warning: string | null,               // e.g. element rare in the training set
//     primitive_structure: <pymatgen dict>, // the cell the predictions refer to
//     feature_names: string[],              // shared ordering for shap.values / features
//     sites: [{
//       label: string,                      // e.g. "Cu a"
//       element: string,
//       site_index: number,                 // index into primitive_structure.sites
//       oxidation_state: number,
//       probability: number,                // max class probability of the ensemble
//       base_model_predictions: number[],   // knn, gradient boosting, logreg, SVM
//       agreement: number,                  // % of base models agreeing, 0-100
//       nearest_training_structures: string[], // CSD refcodes
//       shap: { base_value: number, values: number[] } | null, // null: not explainable
//       features: [{ name, value, percentile, category }],
//     }],
//   }
//
// Errors: non-2xx with FastAPI's { detail: string | [{ msg, ... }] }.

import { toPymatgen } from "matsci-parse";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function errorMessage(detail, status) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg ?? String(d)).join("; ");
  }
  return `Request failed (${status})`;
}

export async function computeOxidationStates(
  structure,
  { approximateShap = true, signal } = {},
) {
  if (import.meta.env.VITE_MOCK_API === "1") {
    const { mockCompute } = await import("./mockApi");
    return mockCompute(structure);
  }

  const res = await fetch(`${API_BASE}/api/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structure: toPymatgen(structure),
      approximate_shap: approximateShap,
    }),
    signal,
  });

  if (!res.ok) {
    let detail;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(errorMessage(detail, res.status));
  }

  return res.json();
}
