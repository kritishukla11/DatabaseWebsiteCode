"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "trn" | "drug";

type ReferenceFile = {
  name: string;
  description: string;
  href: string;
};

export default function DownloadsPage() {
  const BACKEND =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

  const [proteins, setProteins] = useState<string[]>([]);
  const [trns, setTrns] = useState<string[]>([]);
  const [drugs, setDrugs] = useState<string[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);

  const [protein, setProtein] = useState("");
  const [mode, setMode] = useState<Mode>("trn");
  const [selectedTrn, setSelectedTrn] = useState("");
  const [selectedDrug, setSelectedDrug] = useState("");

  const [loadingProteins, setLoadingProteins] = useState(true);
  const [loadingTrns, setLoadingTrns] = useState(false);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [loadingReferenceFiles, setLoadingReferenceFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load proteins once
  useEffect(() => {
    let cancelled = false;

    async function fetchProteins() {
      try {
        setLoadingProteins(true);
        setError(null);

        const res = await fetch(`${BACKEND}/proteins/list`);
        if (!res.ok) {
          throw new Error("Failed to fetch proteins.");
        }

        const data = await res.json();
        if (!cancelled) {
          setProteins(Array.isArray(data.proteins) ? data.proteins : []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch proteins.");
        }
      } finally {
        if (!cancelled) {
          setLoadingProteins(false);
        }
      }
    }

    fetchProteins();

    return () => {
      cancelled = true;
    };
  }, [BACKEND]);

  // Load TRNs whenever protein changes in TRN mode
  useEffect(() => {
    let cancelled = false;

    async function fetchTrns() {
      if (!protein || mode !== "trn") {
        setTrns([]);
        setSelectedTrn("");
        return;
      }

      try {
        setLoadingTrns(true);
        setError(null);
        setSelectedTrn("");

        const res = await fetch(
          `${BACKEND}/flatmap/pathways?gene=${encodeURIComponent(protein)}`
        );
        if (!res.ok) {
          throw new Error("Failed to fetch TRNs.");
        }

        const data = await res.json();
        if (!cancelled) {
          setTrns(Array.isArray(data.pathways) ? data.pathways : []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch TRNs for this protein.");
          setTrns([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingTrns(false);
        }
      }
    }

    fetchTrns();

    return () => {
      cancelled = true;
    };
  }, [BACKEND, protein, mode]);

  // Load drugs once when switching to drug mode
  useEffect(() => {
    let cancelled = false;

    async function fetchDrugs() {
      if (mode !== "drug") return;
      if (drugs.length > 0) return;

      try {
        setLoadingDrugs(true);
        setError(null);

        const res = await fetch(`${BACKEND}/drugs/list`);
        if (!res.ok) {
          throw new Error("Failed to fetch drugs.");
        }

        const data = await res.json();
        if (!cancelled) {
          setDrugs(Array.isArray(data.drugs) ? data.drugs : []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch drugs.");
          setDrugs([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingDrugs(false);
        }
      }
    }

    fetchDrugs();

    return () => {
      cancelled = true;
    };
  }, [BACKEND, mode, drugs.length]);

  // Load reference files once
  useEffect(() => {
    let cancelled = false;

    async function fetchReferenceFiles() {
      try {
        setLoadingReferenceFiles(true);

        const res = await fetch(`${BACKEND}/downloads/reference_files`);
        if (!res.ok) {
          throw new Error("Failed to fetch reference files.");
        }

        const data = await res.json();
        if (!cancelled) {
          setReferenceFiles(Array.isArray(data.files) ? data.files : []);
        }
      } catch {
        if (!cancelled) {
          setReferenceFiles([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingReferenceFiles(false);
        }
      }
    }

    fetchReferenceFiles();

    return () => {
      cancelled = true;
    };
  }, [BACKEND]);

  const trnReady = Boolean(protein && selectedTrn);
  const drugReady = Boolean(protein && selectedDrug);

  const proteinTrnNmfHref = useMemo(() => {
    if (!trnReady) return "#";
    return `${BACKEND}/downloads/protein_trn_csv?gene=${encodeURIComponent(
      protein
    )}&pathway=${encodeURIComponent(selectedTrn)}&kind=nmf2d`;
  }, [BACKEND, protein, selectedTrn, trnReady]);

  const proteinTrnGiHref = useMemo(() => {
    if (!trnReady) return "#";
    return `${BACKEND}/downloads/protein_trn_csv?gene=${encodeURIComponent(
      protein
    )}&pathway=${encodeURIComponent(selectedTrn)}&kind=cluster_gi`;
  }, [BACKEND, protein, selectedTrn, trnReady]);

  const proteinDrugNmfHref = useMemo(() => {
    if (!drugReady) return "#";
    return `${BACKEND}/downloads/protein_drug_csv?gene=${encodeURIComponent(
      protein
    )}&drug=${encodeURIComponent(selectedDrug)}&kind=nmf2d`;
  }, [BACKEND, protein, selectedDrug, drugReady]);

  const proteinDrugLogoddsHref = useMemo(() => {
    if (!drugReady) return "#";
    return `${BACKEND}/downloads/protein_drug_csv?gene=${encodeURIComponent(
      protein
    )}&drug=${encodeURIComponent(selectedDrug)}&kind=cluster_logodds`;
  }, [BACKEND, protein, selectedDrug, drugReady]);

  function handleProteinChange(value: string) {
    setProtein(value);
    setSelectedTrn("");
    setSelectedDrug("");
    setError(null);
  }

  function handleModeChange(nextMode: Mode) {
    setMode(nextMode);
    setSelectedTrn("");
    setSelectedDrug("");
    setError(null);
  }

  return (
    <main className="container">
      <div className="hero">
        <h1 className="title">Downloads</h1>
        <p className="subtitle">
          Select a protein, then choose either a TRN or a drug to download the
          CSV files used to build the map.
        </p>
      </div>

      <section className="card">
        <div className="grid">
          <div className="field">
            <label htmlFor="protein-select" className="label">
              Protein
            </label>
            <select
              id="protein-select"
              value={protein}
              onChange={(e) => handleProteinChange(e.target.value)}
              disabled={loadingProteins}
            >
              <option value="">
                {loadingProteins ? "Loading proteins..." : "Select a protein"}
              </option>
              {proteins.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span className="label">Overlay type</span>
            <div className="toggleRow">
              <button
                type="button"
                className={mode === "trn" ? "toggle active" : "toggle"}
                onClick={() => handleModeChange("trn")}
              >
                TRN
              </button>
              <button
                type="button"
                className={mode === "drug" ? "toggle active" : "toggle"}
                onClick={() => handleModeChange("drug")}
              >
                Drug
              </button>
            </div>
          </div>

          {mode === "trn" && (
            <div className="field fullWidth">
              <label htmlFor="trn-select" className="label">
                TRN
              </label>
              <select
                id="trn-select"
                value={selectedTrn}
                onChange={(e) => setSelectedTrn(e.target.value)}
                disabled={!protein || loadingTrns}
              >
                <option value="">
                  {!protein
                    ? "Select a protein first"
                    : loadingTrns
                    ? "Loading TRNs..."
                    : "Select a TRN"}
                </option>
                {trns.map((trn) => (
                  <option key={trn} value={trn}>
                    {trn}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "drug" && (
            <div className="field fullWidth">
              <label htmlFor="drug-select" className="label">
                Drug
              </label>
              <select
                id="drug-select"
                value={selectedDrug}
                onChange={(e) => setSelectedDrug(e.target.value)}
                disabled={!protein || loadingDrugs}
              >
                <option value="">
                  {!protein
                    ? "Select a protein first"
                    : loadingDrugs
                    ? "Loading drugs..."
                    : "Select a drug"}
                </option>
                {drugs.map((drug) => (
                  <option key={drug} value={drug}>
                    {drug}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {mode === "trn" && trnReady && (
        <section className="downloadsCard">
          <h2 className="sectionTitle">
            {protein} × {selectedTrn}
          </h2>
          <div className="buttonGrid">
            <a href={proteinTrnNmfHref} className="downloadBtn">
              Download 2D NMF info
            </a>
            <a href={proteinTrnGiHref} className="downloadBtn">
              Download cluster level GI* info
            </a>
          </div>
        </section>
      )}

      {mode === "drug" && drugReady && (
        <section className="downloadsCard">
          <h2 className="sectionTitle">
            {protein} × {selectedDrug}
          </h2>
          <div className="buttonGrid">
            <a href={proteinDrugNmfHref} className="downloadBtn">
              Download 2D NMF info
            </a>
            <a href={proteinDrugLogoddsHref} className="downloadBtn">
              Download cluster level logodds info
            </a>
          </div>
        </section>
      )}

      <section className="downloadsCard">
        <h2 className="sectionTitle">Global files for download:</h2>

        {loadingReferenceFiles ? (
          <p className="helperText">Loading reference files...</p>
        ) : referenceFiles.length === 0 ? (
          <p className="helperText">No reference files available.</p>
        ) : (
          <div className="fileList">
            {referenceFiles.map((file) => (
              <div key={file.name} className="fileRow">
                <div className="fileInfo">
                  <div className="fileName">{file.name}</div>
                  <div className="fileDescription">{file.description}</div>
                </div>
                <a
                  href={`${BACKEND}${file.href}`}
                  className="downloadBtn fileDownloadBtn"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 32px 20px 56px;
          background: linear-gradient(180deg, #f8fcff 0%, #ffffff 100%);
          max-width: 980px;
          margin: 0 auto;
        }

        .hero {
          margin-bottom: 28px;
          text-align: center;
        }

        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
        }

        .subtitle {
          margin: 0 auto;
          max-width: 720px;
          color: #4b5563;
          font-size: 1rem;
          line-height: 1.6;
        }

        .card,
        .downloadsCard {
          background: #ffffff;
          border: 1px solid #dbe7f0;
          border-radius: 18px;
          box-shadow: 0 10px 30px rgba(43, 72, 102, 0.08);
        }

        .card {
          padding: 24px;
        }

        .downloadsCard {
          margin-top: 22px;
          padding: 22px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .fullWidth {
          grid-column: 1 / -1;
        }

        .label {
          font-size: 0.95rem;
          font-weight: 700;
          color: #334155;
        }

        select {
          width: 100%;
          padding: 0.85rem 0.95rem;
          border-radius: 12px;
          border: 1px solid #cddbe7;
          background: #ffffff;
          color: #111827;
          font-size: 0.96rem;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        select:focus {
          border-color: #7bafd4;
          box-shadow: 0 0 0 3px rgba(123, 175, 212, 0.18);
        }

        select:disabled {
          background: #f8fafc;
          color: #6b7280;
          cursor: not-allowed;
        }

        .toggleRow {
          display: flex;
          gap: 10px;
        }

        .toggle {
          appearance: none;
          border: 1px solid #cddbe7;
          background: #f8fbfe;
          color: #334155;
          border-radius: 12px;
          padding: 0.8rem 1rem;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          min-width: 120px;
        }

        .toggle:hover {
          background: #eef6fc;
        }

        .toggle.active {
          background: #7bafd4;
          border-color: #7bafd4;
          color: #ffffff;
        }

        .sectionTitle {
          margin: 0 0 14px 0;
          font-size: 1.15rem;
          font-weight: 800;
          color: #1f2937;
        }

        .buttonGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
        }

        .downloadBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          min-height: 52px;
          padding: 0.9rem 1rem;
          border-radius: 12px;
          background: #7bafd4;
          color: #ffffff;
          text-decoration: none;
          font-size: 0.96rem;
          font-weight: 700;
          transition: background 0.15s ease, transform 0.15s ease;
        }

        .downloadBtn:hover {
          background: #5f97bf;
          transform: translateY(-1px);
        }

        .fileList {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .fileRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 16px 0;
          border-top: 1px solid #e5edf4;
        }

        .fileRow:first-child {
          border-top: none;
          padding-top: 4px;
        }

        .fileInfo {
          flex: 1;
          min-width: 0;
        }

        .fileName {
          font-size: 0.98rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 4px;
          word-break: break-word;
        }

        .fileDescription {
          font-size: 0.95rem;
          color: #4b5563;
          line-height: 1.5;
        }

        .fileDownloadBtn {
          min-width: 140px;
          flex-shrink: 0;
        }

        .helperText {
          margin: 0;
          color: #4b5563;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .error {
          margin: 18px 2px 0;
          color: #b91c1c;
          font-size: 0.98rem;
          font-weight: 600;
        }

        @media (max-width: 700px) {
          .container {
            padding: 24px 14px 42px;
          }

          .title {
            font-size: 2rem;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .toggleRow {
            flex-direction: column;
          }

          .toggle {
            width: 100%;
          }

          .fileRow {
            flex-direction: column;
            align-items: stretch;
          }

          .fileDownloadBtn {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>
    </main>
  );
}