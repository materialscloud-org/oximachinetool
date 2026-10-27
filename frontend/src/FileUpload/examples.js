// Example structures loaded on click from /public/examples (the set of the
// original oxiMACHINE tool; legacy Flask app, git 0c46b5f).
export const examples = [
  { label: "Fe(BPZ)", file: "ACODAA.cif" },
  { label: "Cu(I/II)-BTC", file: "KAJZIH_freeONLY.cif" },
  { label: "SnO", file: "SnO_mp-2097_computed.cif" },
  { label: "SnO₂", file: "SnO2_mp-856_computed.cif" },
  { label: "BaO", file: "BaO_mp-1342_computed.cif" },
  { label: "BaO₂", file: "BaO2_mp-1105_computed.cif" },
  // Disabled: the CIF itself is defective (duplicate _atom_site_label entries,
  // a redundant atom list expanded again by the declared Fm-3m symmetry,
  // 4-decimal coordinates), so parsers disagree on its contents and pymatgen
  // rejects it.
  // { label: "Defective UiO-66", file: "UiO66_GC1.cif" },
].map((example) => ({ ...example, url: `/examples/${example.file}` }));
