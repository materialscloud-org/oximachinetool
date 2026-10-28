import { isDisordered } from "matsci-parse";
import { McStructureUpload } from "mc-react-library";

import { examples } from "./examples";

// The model was trained on ordered, periodic structures only.
function checkOrdered(structure) {
  if (!structure.lattice?.basis) {
    throw new Error(
      "This structure has no unit cell. oxiMACHINE needs a periodic crystal structure (e.g. a CIF).",
    );
  }
  if (isDisordered(structure)) {
    throw new Error(
      "This structure contains partial occupancies. oxiMACHINE only supports ordered structures: please resolve the disorder (e.g. keep one component) and try again.",
    );
  }
}

export default function CrystalStructureUpload(props) {
  return (
    <McStructureUpload
      historyKey="oximachine.parsedStructures"
      examples={examples}
      validate={checkOrdered}
      accept=".cif,.vasp,.poscar,.xsf,.in,.pwi"
      hint="CIF, POSCAR, XSF and Quantum ESPRESSO files (ordered structures, up to 500 atoms in the primitive cell)"
      {...props}
    />
  );
}
