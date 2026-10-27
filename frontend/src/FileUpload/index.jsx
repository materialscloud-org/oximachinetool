import { useEffect, useState } from "react";
import { fromJSON, isDisordered, toJSON } from "matsci-parse";

import { parseFileText } from "./formats";
import { examples } from "./examples";
import { TermsOfUseContent } from "../AccordionContent";
import {
  HashModal,
  McDropzone,
  McHistoryList,
  RemoteStructureLoader,
  shortHashForUrl,
  createHistoryStore,
} from "mc-react-library";

const historyStore = createHistoryStore("oximachine.parsedStructures");

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

export default function CrystalStructureUpload({
  onStructureParsed,
  className = "",
}) {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(() => historyStore.load());
  const [exampleLoading, setExampleLoading] = useState(null);
  // When ?fromURL is already in history (matched by short hash before any
  // fetch), load it from local storage instead of hitting the backend.
  const [remoteAutoLoad, setRemoteAutoLoad] = useState(true);

  useEffect(() => {
    try {
      const url = new URLSearchParams(window.location.search).get("fromURL");
      const hash = url && shortHashForUrl(url);
      const existing =
        hash && historyStore.load().find((entry) => entry.fileName === hash);
      if (existing) {
        setRemoteAutoLoad(false);
        onStructureParsed?.({
          format: existing.format,
          structure: fromJSON(existing.structure),
          fileName: existing.fileName,
          id: existing.id,
        });
      }
    } catch {
      /* fall through to remote fetch */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToHistory = ({ fileName, format, structure }) => {
    if (historyStore.load().some((entry) => entry.fileName === fileName))
      return;
    setHistory(
      historyStore.add({
        id: crypto.randomUUID(),
        fileName,
        format,
        date: new Date().toISOString(),
        structure: toJSON(structure),
      }),
    );
  };

  const handleRemoteLoaded = ({ structure, format, fileName }) => {
    setError(null);
    try {
      checkOrdered(structure);
    } catch (err) {
      setError(err.message);
      return;
    }
    onStructureParsed?.({ format, structure, fileName });
    addToHistory({ fileName, format, structure });
  };

  const handleFile = async (selectedFile) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setParsing(true);

    try {
      const text = await selectedFile.text();
      const { format, structure } = parseFileText(text);
      checkOrdered(structure);
      onStructureParsed?.({ format, structure, fileName: selectedFile.name });
      addToHistory({ fileName: selectedFile.name, format, structure });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  };

  const handleLoadFromHistory = (entry) => {
    setError(null);
    try {
      onStructureParsed?.({
        format: entry.format,
        structure: fromJSON(entry.structure),
        fileName: entry.fileName,
        id: entry.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLoadExample = async (example) => {
    setError(null);
    setExampleLoading(example.url);
    try {
      const res = await fetch(example.url);
      if (!res.ok) throw new Error(`Failed to load example (${res.status})`);
      const text = await res.text();
      const { format, structure } = parseFileText(text);
      checkOrdered(structure);
      onStructureParsed?.({ format, structure, fileName: example.file });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExampleLoading(null);
    }
  };

  return (
    <div className={`pt-2 ${className}`}>
      <label className="mb-2 block text-sm font-semibold text-slate-800">
        Upload a crystal structure
      </label>

      <McDropzone
        accept=".cif,.vasp,.poscar,.xsf,.in,.pwi"
        fileName={file?.name}
        onFile={handleFile}
        title="Drop your crystal structure here"
        hint="CIF, POSCAR, XSF and Quantum ESPRESSO files (ordered structures, up to 500 atoms in the primitive cell)"
      />

      <p className="mt-3 text-center text-xs text-slate-400">
        By continuing you agree to our{" "}
        <a
          href="#terms"
          className="font-medium text-blue-600 underline-offset-2 hover:underline"
        >
          Terms of use
        </a>
      </p>

      <HashModal hash="terms" title="oxiMACHINE terms of use">
        <TermsOfUseContent />
      </HashModal>

      {parsing && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          Parsing {file?.name}...
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <RemoteStructureLoader
        autoLoad={remoteAutoLoad}
        onLoaded={handleRemoteLoaded}
        onError={(message) => setError(message)}
      />

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">
          Otherwise, pick an example
        </p>
        <select
          value=""
          onChange={(e) => {
            const example = examples.find((x) => x.url === e.target.value);
            if (example) handleLoadExample(example);
          }}
          disabled={exampleLoading !== null}
          className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">
            {exampleLoading ? "Loading example…" : "Select an example…"}
          </option>
          {examples.map((example) => (
            <option key={example.url} value={example.url}>
              {example.label}
            </option>
          ))}
        </select>
      </div>

      {history.length > 0 && (
        <div className="mt-5">
          <McHistoryList
            title="Previously uploaded structures"
            entries={history}
            onLoad={handleLoadFromHistory}
            onDelete={(id) => setHistory(historyStore.remove(id))}
            onClear={() => setHistory(historyStore.clear())}
          />
        </div>
      )}
    </div>
  );
}
