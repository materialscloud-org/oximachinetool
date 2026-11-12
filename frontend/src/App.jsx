import "./index.css";
import MaterialsCloudHeader from "mc-react-header";
import { useState } from "react";

import InfoAccordions from "./AccordionContent";
import CrystalUpload from "./FileUpload";
import OxiMachine from "./OxiMachine";

// Current policy is no mc-keyvalues-stores allowed in apps
import { McAppHeader /* , McShareButton, toStructureShare */ } from "mc-react-library";

function App() {
  // { structure, fileName, format, shareId? }
  const [loaded, setLoaded] = useState(null);

  return (
    <>
      <MaterialsCloudHeader
        activeSection="work"
        breadcrumbsPath={[
          { name: "Work", link: "https://www.materialscloud.org/work" },
          { name: "Tools", link: "https://www.materialscloud.org/work/tools" },
          { name: "oxiMACHINE", link: null },
        ]}
      />

      <main className="min-h-screen bg-[aliceblue] pb-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="overflow-hidden bg-white p-4 shadow-sm">
            <McAppHeader
              title={
                <>
                  <span className="font-bold">oxiMACHINE</span>: predicting
                  oxidation states for MOFs
                </>
              }
              logo={`${import.meta.env.BASE_URL}oximachine_logo.png`}
              logoAlt="oxiMACHINE logo"
              dois={[
                {
                  doi: "10.26434/chemrxiv.11604129.v1",
                  label: "ChemRxiv",
                  color: "#a2e5b7",
                },
              ]}
            />
            <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
              <div className="space-y-3">
                <InfoAccordions />

                <CrystalUpload onStructureParsed={setLoaded} />
              </div>
            </div>

            <OxiMachine
              structure={loaded?.structure}
              fileName={loaded?.fileName}
            />

            {/* Current policy is no mc-keyvalues-stores allowed in apps
            <McShareButton
              data={loaded}
              toDocument={toStructureShare}
              shareId={loaded?.shareId}
              className="mx-auto max-w-6xl px-6 sm:px-10"
            /> */}
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
