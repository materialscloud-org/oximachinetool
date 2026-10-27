// Formatting helpers that used to live in Jinja templates / predict.py.

const ROMAN = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(n) {
  if (n === 0) return "0";
  let out = n < 0 ? "−" : "";
  let rest = Math.abs(n);
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

// Same thresholds as the original progress-bar colouring.
export function agreementColor(agreement) {
  if (agreement > 80) return "bg-emerald-500";
  if (agreement < 60) return "bg-red-500";
  return "bg-amber-400";
}

// Approximation of matplotlib's coolwarm, normalised to the 10-90
// percentile range as in the original featurize.py.
const COOL = [59, 76, 192];
const MID = [221, 221, 221];
const WARM = [180, 4, 38];

export function percentileColor(percentile) {
  const t = Math.min(1, Math.max(0, (percentile - 10) / 80));
  const [a, b, u] = t < 0.5 ? [COOL, MID, t * 2] : [MID, WARM, (t - 0.5) * 2];
  const rgb = a.map((c, i) => Math.round(c + (b[i] - c) * u));
  return `rgb(${rgb.join(",")})`;
}

export function csdUrl(refcode) {
  return `https://www.ccdc.cam.ac.uk/structures/Search?Ccdcid=${encodeURIComponent(refcode)}&DatabaseToSearch=Published`;
}

export const PREPRINT_URL =
  "https://chemrxiv.org/articles/Using_Collective_Knowledge_to_Assign_Oxidation_States/11604129/1";

// The original tool refused anything larger (checked on the primitive cell,
// which the backend still enforces).
export const MAX_NUMBER_OF_ATOMS = 500;
