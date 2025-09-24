"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function PathwaySearchPage() {
  const searchParams = useSearchParams();
  const pathway = searchParams.get("pathway") || "";
  const [showExplanation, setShowExplanation] = useState(false);

  // state for proteins panel
  const [threshold, setThreshold] = useState(0.2);
  const [proteins, setProteins] = useState<{ id: string; score: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // state for STRING evidence panel
  const [interactions, setInteractions] = useState<
    { prediction_protein: string; geneset_protein: string; score: number }[]
  >([]);
  const [stringError, setStringError] = useState<string | null>(null);

  // state for description panel
  const [description, setDescription] = useState<string | null>(null);
  const [pubmed, setPubmed] = useState<string | null>(null);
  const [authors, setAuthors] = useState<string | null>(null);

  // fetch proteins
  useEffect(() => {
    if (!pathway) return;

    fetch(
      `http://127.0.0.1:8001/pathway/proteins?pathway=${encodeURIComponent(
        pathway
      )}&threshold=${threshold}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(
            "Sorry, we don't have information for this transcription regulatory network"
          );
          setProteins([]);
          setStringError(null);
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

  // fetch STRING interactions
  useEffect(() => {
    if (!pathway) return;

    fetch(
      `http://127.0.0.1:8001/stringdb/pathway_interactions?pathway=${encodeURIComponent(
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
          setInteractions(data.interactions || []);
        }
      })
      .catch(() => {
        setStringError("Failed to fetch STRING interactions.");
        setInteractions([]);
      });
  }, [pathway, threshold]);

  // fetch pathway description
  useEffect(() => {
    if (!pathway) return;

    fetch(
      `http://127.0.0.1:8001/pathway/description?pathway=${encodeURIComponent(
        pathway
      )}`
    )
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

  return (
    <main className="container">
      <h1 className="title">
        Results for: {pathway} Transcriptional Regulatory Network
      </h1>

      {/* Error message if pathway not found */}
      {error && <p className="error">{error}</p>}

      {!error && (
        <>
          {/* Expandable Explanation Panel */}
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
                  resource of gene sets used for gene set enrichment analysis
                  and related approaches. Gene sets in MSigDB are organized into
                  collections that capture different types of biological
                  knowledge, including canonical pathways, Gene Ontology terms,
                  oncogenic and immunologic signatures, and transcription factor
                  targets.
                </p>

                <p>
                  Within MSigDB, the Transcription Factor Targets (TFT)
                  collection derived from the Gene Transcription Regulation
                  Database (GTRD) represents gene sets defined by transcription
                  factor binding profiles. These sets are constructed by
                  aggregating and uniformly processing large-scale ChIP-seq
                  experiments. The resulting TFT:GTRD pathways provide
                  experimentally supported maps of regulatory programs, enabling
                  the identification of transcription factors that may drive
                  observed gene expression changes.
                </p>
              </div>
            )}
          </div>

          {/* Row 1: full-width description panel */}
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

          {/* Row 2: two half-width panels */}
          <div className="panel-row">
            {/* Left: proteins above threshold */}
            <div className="panel half">
              <h2 className="panel-title">
                Proteins with strong association scores with the {pathway} TRN
              </h2>

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
                      {p.id} —{" "}
                      <span className="score">{p.score.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No proteins found above threshold.</p>
              )}
            </div>

            {/* Right: STRING interactions */}
            <div className="panel half">
              <h2 className="panel-title">STRING Evidence</h2>

              {stringError ? (
                <p className="error">{stringError}</p>
              ) : interactions.length ? (
                <table className="string-table">
                  <thead>
                    <tr>
                      <th>Protein from Prediction</th>
                      <th>Protein in {pathway} Gene Set</th>
                      <th>STRING Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.map((i, idx) => (
                      <tr key={idx}>
                        <td>{i.prediction_protein}</td>
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
          background: #ffffff;
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
          transition: all 0.3s ease-in-out;
        }
        .panel.full {
          width: 100%;
          margin-bottom: 2rem;
        }
        .panel-title {
          color: #7bafd4;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .panel-title.clickable {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .expandable {
          cursor: pointer;
          background: #f1f9ff;
        }
        .explanation-text {
          margin-top: 1rem;
          font-size: 1rem;
          color: #333;
          line-height: 1.5;
        }
        .explanation-text p {
          margin-bottom: 1rem;
        }
        .panel-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .error {
          color: red;
          font-size: 1.2rem;
          text-align: center;
          margin: 2rem 0;
        }
        ul {
          margin-top: 1rem;
          padding-left: 1rem;
        }
        .score {
          color: #555;
          font-weight: 500;
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
          background-color: #f1f9ff;
          color: #333;
          font-weight: 700;
        }
        .string-table tr:nth-child(even) {
          background-color: #fafafa;
        }
        @media (max-width: 900px) {
          .panel-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}



