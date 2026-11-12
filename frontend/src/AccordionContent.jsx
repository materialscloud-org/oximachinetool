// Content of the information accordions of the landing page
// (ported from the legacy Flask app, git 0c46b5f:
// webservice/templates/visualizer_select_base.html).

import { useState } from "react";
import { DoiBadge, McInfoAccordion } from "mc-react-library";

import { PREPRINT_URL } from "./utils";

/** "What oxiMACHINE does" accordion. */
function WhatOximachineDoesContent() {
  return (
    <div className="space-y-3">
      <p>
        This tool takes <strong>a crystal structure</strong> and predicts the{" "}
        <strong>oxidation state of each metal site</strong>. Note that:
      </p>
      <ul className="list-disc pl-10">
        <li>
          we automatically calculate the primitive structure, and show the
          primitive structure in the visualizer;
        </li>
        <li>
          calculations in this web app are limited to structures with fewer than
          500 atoms (in the primitive cell), without disorder;
        </li>
        <li>
          we attempt to detect atomic overlaps and return an error if we find
          any;
        </li>
        <li>
          the model was trained on the oxidation states of MOFs deposited in the
          MOF subset of the Cambridge Structural Database.
        </li>
      </ul>
      <p>In addition to the oxidation state predictions, we also output:</p>
      <ul className="list-disc pl-10">
        <li>the confidence in the assignment;</li>
        <li>the closest structures in the training set;</li>
        <li>the feature values and feature importance for each metal site.</li>
      </ul>
      <p>
        More information about this tool can be found in the{" "}
        <a href={PREPRINT_URL} target="_blank" rel="noreferrer">
          preprint on ChemRxiv
        </a>
        . For structures with many metal centres, consider running the{" "}
        <a
          href="https://github.com/kjappelbaum/oximachinerunner"
          target="_blank"
          rel="noreferrer"
        >
          oximachinerunner
        </a>{" "}
        on your own machine.
      </p>
    </div>
  );
}

/** "Acknowledgements" accordion. */
function AcknowledgementsContent() {
  return (
    <div className="space-y-3">
      <p>
        This work is supported by the European Research Council (ERC) Advanced
        Grant{" "}
        <a
          href="https://cordis.europa.eu/project/rcn/197913/factsheet/en"
          target="_blank"
          rel="noreferrer"
        >
          (Agreement No. 666983, MaGic)
        </a>{" "}
        and the computing facilities of{" "}
        <a
          href="https://www.epfl.ch/research/facilities/scitas/"
          target="_blank"
          rel="noreferrer"
        >
          SCITAS, EPFL
        </a>
        .
      </p>
      <p>
        We use the following libraries, please also consider acknowledging them:
      </p>
      <ul className="list-disc pl-10">
        <li>
          <a href="https://pymatgen.org/">pymatgen</a>
        </li>
        <li>
          <a href="https://hackingmaterials.lbl.gov/matminer/">matminer</a>
        </li>
        <li>
          <a href="https://scikit-learn.org/">scikit-learn</a>
        </li>
        <li>
          <a href="https://shap.readthedocs.io/">shap</a>
        </li>
        <li>
          <a href="https://www.npmjs.com/package/matsci-parse">matsci-parse</a>
        </li>
      </ul>
      <p>
        For training the models, we used data deposited in the Cambridge
        Structural Database (CSD). The following references describe the MOF
        subset and the CSD in general:
      </p>
      <ol className="list-decimal pl-10 space-y-1">
        <li>
          Moghadam, P. Z.; Li, A.; Wiggin, S. B.; Tao, A.; Maloney, A. G. P.;
          Wood, P. A.; Ward, S. C.; Fairen-Jimenez, D. <i>Chem. Mater.</i>{" "}
          <b>2017</b>, 29 (7), 2618–2625.{" "}
          <span className="inline-block align-middle">
            <DoiBadge
              doi="10.1021/acs.chemmater.7b00441"
              label="Chem. Mater."
              color="#a2e5b7"
            />
          </span>
        </li>
        <li>
          Groom, C. R.; Bruno, I. J.; Lightfoot, M. P.; Ward, S. C.{" "}
          <i>Acta Crystallogr. B</i> <b>2016</b>, 72 (2), 171–179.{" "}
          <span className="inline-block align-middle">
            <DoiBadge
              doi="10.1107/S2052520616003954"
              label="Acta Cryst. B"
              color="#a2e5b7"
            />
          </span>
        </li>
      </ol>
    </div>
  );
}

/** "How to cite" accordion. */
function HowToCiteContent() {
  return (
    <div>
      If you use this tool, please cite the{" "}
      <a href={PREPRINT_URL} target="_blank" rel="noreferrer">
        preprint on ChemRxiv
      </a>{" "}
      <span className="inline-block align-middle">
        <DoiBadge
          doi="10.26434/chemrxiv.11604129.v1"
          label="ChemRxiv"
          color="#a2e5b7"
        />
      </span>
      .
    </div>
  );
}

const ACCORDIONS = [
  { title: "What oxiMACHINE does", content: <WhatOximachineDoesContent /> },
  { title: "Acknowledgements", content: <AcknowledgementsContent /> },
  { title: "How to cite", content: <HowToCiteContent /> },
];

/** The information accordions at the top of the page, one open at a time. */
export default function InfoAccordions() {
  const [open, setOpen] = useState(null);
  return ACCORDIONS.map(({ title, content }, i) => (
    <McInfoAccordion
      key={title}
      title={title}
      open={open === i}
      onToggle={() => setOpen(open === i ? null : i)}
    >
      {content}
    </McInfoAccordion>
  ));
}
