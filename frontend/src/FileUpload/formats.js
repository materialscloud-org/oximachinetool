import { fromCIF, fromXYZ, fromPOSCAR, fromXSF, fromPW } from "matsci-parse";

export function detectFormat(fileText) {
  const lines = fileText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.some((l) => /^ATOMIC_POSITIONS/i.test(l))) return "pw";
  if (lines.some((l) => /^CELL_PARAMETERS/i.test(l))) return "pw";

  if (
    lines[0]?.startsWith("data_") ||
    lines.some((l) => /^_cell_length_/i.test(l))
  )
    return "cif";

  if (lines[0]?.match(/^\d+$/) && lines.length >= 2) return "xyz";

  if (
    lines.length >= 5 &&
    !isNaN(parseFloat(lines[1])) &&
    lines[2]?.split(/\s+/).length === 3
  )
    return "poscar";

  if (lines.some((l) => /^CRYSTAL/i.test(l) || /^PRIMVEC/i.test(l)))
    return "xsf";

  return "unknown";
}

export const importers = {
  pw: fromPW,
  cif: fromCIF,
  xsf: fromXSF,
  xyz: fromXYZ,
  poscar: fromPOSCAR,
};

export function parseFileText(fileText) {
  const format = detectFormat(fileText);
  const importer = importers[format];

  if (!importer) {
    throw new Error(`Unsupported format: ${format}`);
  }

  const structure = importer(fileText);

  return {
    format,
    structure,
  };
}