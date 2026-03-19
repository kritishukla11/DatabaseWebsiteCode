"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://127.0.0.1:8001";

export default function PathwayPageContent() {
  const searchParams = useSearchParams();
  const pathway = searchParams.get("pathway") || "";
  const [showExplanation, setShowExplanation] = useState(false);

  // ─── State ───────────────────────────────────────────────
  const [threshold, setThreshold] = useState(0.8);
  const [proteins, setProteins] = useState<{ id: string; score: number }[]>([]);
  const [interactions, setInteractions] = useState<
    {
      prediction_protein: string;
      geneset_protein: string;
      score: number;
      ai_score?: number | null;
    }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [stringError, setStringError] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [pubmed, setPubmed] = useState<string | null>(null);
  const [authors, setAuthors] = useState<string | null>(null);

  // ─── Helpers for CSV download ────────────────────────────
  function escapeCsvValue(value: string | number | null | undefined) {
    if (value == null) return "";
    const str = String(value);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function downloadCsv(
    filename: string,
    headers: string[],
    rows: (string | number | null | undefined)[][]
  ) {
    const csv = [
      headers.map(escapeCsvValue).join(","),
      ...rows.map((row) => row.map(escapeCsvValue).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  }

  function handleDownloadProteinsCsv() {
    const rows = proteins.map((p, idx) => [
      idx + 1,
      p.id,
      p.score.toFixed(3),
      threshold.toFixed(1),
      pathway,
    ]);

    downloadCsv(
      `${pathway || "pathway"}_predicted_proteins_threshold_${threshold.toFixed(1)}.csv`,
      ["rank", "protein", "ai_association_score", "threshold", "pathway"],
      rows
    );
  }

  function handleDownloadInteractionsCsv() {
    const rows = interactions.map((i) => [
      i.prediction_protein,
      i.ai_score != null ? i.ai_score.toFixed(3) : "",
      i.geneset_protein,
      i.score.toFixed(2),
      threshold.toFixed(1),
      pathway,
    ]);

    downloadCsv(
      `${pathway || "pathway"}_string_interactions_threshold_${threshold.toFixed(1)}.csv`,
      [
        "prediction_protein",
        "ai_association_score",
        "geneset_protein",
        "string_score",
        "threshold",
        "pathway",
      ],
      rows
    );
  }

  // ─── Fetch predicted proteins ─────────────────────────────
  useEffect(() => {
    if (!pathway) return;
    fetch(
      `${BACKEND}/pathway/proteins?pathway=${encodeURIComponent(
        pathway
      )}&threshold=${threshold}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError("Sorry, we don't have information for this transcription regulatory network");
          setProteins([]);
          setInteractions([]);
        } else {
          setError(null);
          setProteins(
            data.proteins.map((p: string, i: number) => ({
              id: p,
              score: data.scores[i],
            }))
          );
        }
      })
      .catch(() => {
        setError("Failed to fetch proteins.");
        setProteins([]);
      });
  }, [pathway, threshold]);

  // ─── Fetch STRING interactions ────────────────────────────
  useEffect(() => {
    if (!pathway) return;
    fetch(
      `${BACKEND}/stringdb/pathway_interactions?pathway=${encodeURIComponent(
        pathway
      )}&threshold=${threshold}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStringError(data.error);
          setInteractions([]);
        } else {
          setStringError(null);

          const orderMap = new Map(proteins.map((p, i) => [p.id.toUpperCase(), i]));
          const sorted = (data.interactions || []).sort((a: any, b: any) => {
            const aOrd = orderMap.get(a.prediction_protein.toUpperCase()) ?? Infinity;
            const bOrd = orderMap.get(b.prediction_protein.toUpperCase()) ?? Infinity;
            return aOrd - bOrd;
          });

          const scoreMap = new Map(proteins.map((p) => [p.id.toUpperCase(), p.score]));
          const enriched = sorted.map((i: any) => ({
            ...i,
            ai_score: scoreMap.get(i.prediction_protein.toUpperCase()) ?? null,
          }));

          setInteractions(enriched);
        }
      })
      .catch(() => {
        setStringError("Failed to fetch STRING interactions.");
        setInteractions([]);
      });
  }, [pathway, threshold, proteins]);

  // ─── Fetch pathway description ────────────────────────────
  useEffect(() => {
    if (!pathway) return;
    fetch(`${BACKEND}/pathway/description?pathway=${encodeURIComponent(pathway)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setDescription(null);
          setPubmed(null);
          setAuthors(null);
        } else {
          setDescription(data.description || null);
          setPubmed(data.pubmed || null);
          setAuthors(data.authors || null);
        }
      })
      .catch(() => {
        setDescription(null);
        setPubmed(null);
        setAuthors(null);
      });
  }, [pathway]);

  // ─── Compute top-10 without STRING evidence ───────────────
  const topWithoutString = useMemo(() => {
    if (!proteins.length) return [];
    const withString = new Set(interactions.map((i) => i.prediction_protein.toUpperCase()));
    return proteins.filter((p) => !withString.has(p.id.toUpperCase())).slice(0, 10);
  }, [proteins, interactions]);

  // ─── Render ───────────────────────────────────────────────
  return (
    <main className="container">
      <h1 className="title">Results for: {pathway} Transcriptional Regulatory Network</h1>

      {error && <p className="error">{error}</p>}

      {!error && (
        <>
          {/* ── Info panel ── */}
          <div
            className="panel full expandable"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            <h2 className="panel-title clickable">
              {showExplanation ? "▼" : "▶"} Click here for an explanation of how
              the genes in the Transcriptional Regulatory Networks are curated
            </h2>
            {showExplanation && (
              <div className="explanation-text">
                <p>
                  The Molecular Signatures Database (MSigDB) is a curated
                  resource of gene sets used for gene set enrichment analysis.
                  The Transcription Factor Targets (TFT) collection derived from
                  GTRD represents gene sets defined by transcription factor
                  binding profiles, enabling identification of regulators that
                  may drive expression changes.
                </p>
              </div>
            )}
          </div>

          {/* ── Description panel ── */}
          <div className="panel full">
            <h2 className="panel-title">{pathway} Gene Set Description</h2>
            {description ? (
              <>
                <p>{description}</p>
                {authors && (
                  <p>
                    <strong>Authors:</strong> {authors}
                  </p>
                )}
                {pubmed && (
                  <p>
                    <strong>Publication:</strong>{" "}
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${pubmed}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PubMed {pubmed}
                    </a>
                  </p>
                )}
              </>
            ) : (
              <p>No description available for this gene set.</p>
            )}
          </div>

          {/* ── Two half-width panels ── */}
          <div className="panel-row">
            {/* Left: predicted proteins */}
            <div className="panel half">
              <div className="panel-header">
                <h2 className="panel-title">
                  Proteins sorted by AI-predicted Association Scores with the {pathway} TRN
                </h2>
                <button
                  className="download-btn"
                  onClick={handleDownloadProteinsCsv}
                  disabled={!proteins.length}
                >
                  Download CSV
                </button>
              </div>

              <label>
                Minimum Association Score:{" "}
                <select
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                >
                  {[...Array(10)].map((_, i) => {
                    const val = i / 10;
                    return (
                      <option key={val} value={val}>
                        {val.toFixed(1)}
                      </option>
                    );
                  })}
                </select>
              </label>

              {proteins.length ? (
                <ul>
                  {proteins.map((p) => (
                    <li key={p.id}>
                      {p.id} — <span className="score">{p.score.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No proteins found above threshold.</p>
              )}
            </div>

            {/* Right: STRING evidence */}
            <div className="panel half">
              <div className="panel-header">
                <h2 className="panel-title">
                  STRING-DB Evidence of Associations between AI-predicted Proteins and
                  Known Proteins in the {pathway} Gene Set
                </h2>
                <button
                  className="download-btn"
                  onClick={handleDownloadInteractionsCsv}
                  disabled={!interactions.length}
                >
                  Download CSV
                </button>
              </div>

              {topWithoutString.length > 0 && (
                <p className="no-string-summary">
                  <strong>
                    Top 10 proteins with predicted associations to {pathway} without STRING evidence:
                  </strong>{" "}
                  {topWithoutString
                    .map((p) => `${p.id} (${p.score.toFixed(3)})`)
                    .join(", ")}
                </p>
              )}

              {stringError ? (
                <p className="error">{stringError}</p>
              ) : interactions.length ? (
                <table className="string-table">
                  <thead>
                    <tr>
                      <th>Protein from Prediction</th>
                      <th>AI Association Score</th>
                      <th>Protein in {pathway} Gene Set</th>
                      <th>STRING Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.map((i, idx) => (
                      <tr key={idx}>
                        <td>{i.prediction_protein}</td>
                        <td>{i.ai_score != null ? i.ai_score.toFixed(3) : "—"}</td>
                        <td>{i.geneset_protein}</td>
                        <td>{i.score.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No STRING interactions found for this set.</p>
              )}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .container {
          background: #fff;
          min-height: 100vh;
          padding: 12px;
        }
        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 1.5rem;
        }
        .panel {
          background: white;
          border: 2px solid #7bafd4;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .panel.full {
          width: 100%;
          margin-bottom: 2rem;
        }
        .panel-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .panel.half {
          width: 100%;
        }
        .panel-title {
          color: #7bafd4;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        .panel-header .panel-title {
          margin-bottom: 0;
          flex: 1;
        }
        .download-btn {
          background: #7bafd4;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 0.55rem 0.9rem;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .download-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .download-btn:disabled {
          background: #b9cddd;
          cursor: not-allowed;
        }
        .expandable {
          cursor: pointer;
          background: #f1f9ff;
        }
        .explanation-text {
          margin-top: 1rem;
          font-size: 1rem;
          color: #333;
        }
        .error {
          color: red;
          text-align: center;
          margin: 1rem 0;
        }
        ul {
          margin-top: 1rem;
          padding-left: 1rem;
        }
        .score {
          color: #555;
          font-weight: 500;
        }
        .no-string-summary {
          background: #f1f9ff;
          border-left: 4px solid #7bafd4;
          padding: 0.6rem 0.8rem;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
          color: #333;
        }
        .string-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          font-size: 0.95rem;
        }
        .string-table th,
        .string-table td {
          border: 1px solid #ccc;
          padding: 0.5rem;
          text-align: center;
        }
        .string-table th {
          background: #f1f9ff;
          color: #333;
        }
        .string-table tr:nth-child(even) {
          background: #fafafa;
        }
        @media (max-width: 900px) {
          .panel-row {
            grid-template-columns: 1fr;
          }
          .panel-header {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </main>
  );
}