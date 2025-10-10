"use client";

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel3Calibration({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [showGenes, setShowGenes] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [genes, setGenes] = useState<{ gene: string; confidence: number }[]>([]);

  // --- Load calibration plot ---
  useEffect(() => {
    if (!gene) {
      setImgUrl(null);
      return;
    }
    const url = `${BACKEND}/calibration/image?gene=${encodeURIComponent(
      gene
    )}&_ts=${Date.now()}`;
    setImgUrl(url);
  }, [gene]);

  // --- Load partner TRNs if button toggled ---
  useEffect(() => {
    if (showGenes && gene) {
      fetch(`${BACKEND}/calibration/genes?gene=${encodeURIComponent(gene)}`)
        .then((res) => res.json())
        .then((data) =>
          setGenes(Array.isArray(data) ? data : data.genes || [])
        )
        .catch((err) => {
          console.error("Error fetching partner genes:", err);
          setGenes([]);
        });
    }
  }, [showGenes, gene]);

  return (
    <div className="border rounded-lg shadow bg-white p-4 flex flex-col items-center">
      {/* === Info section toggle === */}
      <div className="w-full flex justify-start mb-2">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="flex items-center gap-2 text-green-600 hover:text-green-700 font-medium"
        >
          <span>{showInfo ? "▼" : "▶"}</span>
          <span>What does this analysis show?</span>
        </button>
      </div>

      {showInfo && (
        <div className="text-sm text-gray-700 bg-gray-50 border rounded-md p-3 mb-3 w-full max-w-3xl">
          <p className="mb-2">
            To test whether our predicted protein–pathway relationships hold up
            in single-cell experiments, we integrate <b>Perturb-seq</b> data.
            Perturb-seq is a single-cell CRISPR screening method that links
            targeted gene perturbations (e.g., knockdowns or knockouts) to their
            downstream transcriptional effects by combining pooled CRISPR
            editing with single-cell RNA sequencing. Our Perturb-seq data comes
            from the X-Atlas/Orion dataset, which contains Perturb-seq data for
            all human protein-coding genes in the HCT116 colorectal carcinoma
            cell line.
          </p>
          <p className="mb-2">
            For each protein, we identify the most impactful transcriptional
            regulatory networks (TRNs) by ranking them based on the highest
            region-specific score across the protein’s structure.
          </p>
          <p className="mb-2">
            Using Perturb-seq profiles, we then compare cells where the protein
            is knocked down versus control cells, assessing how strongly each
            TRN’s gene set is activated (via GSEA). The resulting p-values
            capture how significantly a TRN’s activity changes when that protein
            is perturbed.
          </p>
          <p>
            Finally, an <b>empirical calibration analysis</b> relates TRN rank
            to confidence, showing how structural variant hotspots translate
            into measurable transcriptional effects—bridging structure and
            function.
          </p>
        </div>
      )}

      {/* === Calibration plot === */}
      <div style={{ minHeight: "400px", width: "100%", textAlign: "center" }}>
        {!gene ? (
          <p className="text-gray-500">No gene selected.</p>
        ) : !imgUrl ? (
          <p className="text-gray-500">Loading calibration plot...</p>
        ) : (
          <img
            src={imgUrl}
            alt={`Calibration plot for ${gene}`}
            style={{
              width: "90%",
              height: "90%",
              maxWidth: "800px",
              maxHeight: "600px",
              margin: "0 auto",
              display: "block",
              objectFit: "contain",
            }}
          />
        )}
      </div>

      {/* === TRN list toggle === */}
      {gene && (
        <button
          onClick={() => setShowGenes(!showGenes)}
          className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          {showGenes ? "Hide TRN rankings" : "Click here to see TRN rankings"}
        </button>
      )}

      {/* === Scrollable list === */}
      {showGenes && genes.length > 0 && (
        <div
          className="mt-3 border rounded bg-gray-50 w-full max-w-md p-2"
          style={{ maxHeight: "300px", overflowY: "auto" }}
        >
          <ul>
            {genes.map((g, i) => (
              <li key={i} className="border-b last:border-none py-1 text-left">
                {i + 1}. {g.gene} – {g.confidence.toFixed(3)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}







