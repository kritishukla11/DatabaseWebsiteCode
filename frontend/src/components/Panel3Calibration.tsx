"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel3Calibration({ gene }: { gene: string }) {
  const router = useRouter();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [showGenes, setShowGenes] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [genes, setGenes] = useState<{ gene: string; confidence: number }[]>([]);
  const [hasMave, setHasMave] = useState(false); // ✅ added

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

  // --- Load summary sentence ---
  useEffect(() => {
    if (!gene) {
      setSummary("");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${BACKEND}/calibration/summary?gene=${encodeURIComponent(gene)}`
        );
        const data = await res.json();
        setSummary(data.summary || "");
      } catch (err) {
        console.error("Error fetching calibration summary:", err);
        setSummary("");
      }
    })();
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

  // --- ✅ Check if MAVE data exists ---
  useEffect(() => {
    if (!gene) return;
    fetch(`${BACKEND}/mave/data?gene=${encodeURIComponent(gene)}`)
      .then((res) => setHasMave(res.ok))
      .catch(() => setHasMave(false));
  }, [gene]);

  return (
    <div className="border rounded-lg shadow bg-white p-4 flex flex-col items-center min-h-[650px]">
      {/* === Summary sentence === */}
      {summary && (
        <p className="text-sm italic text-gray-700 text-center max-w-md mb-4 transition-opacity duration-500">
          {summary}
        </p>
      )}

      {/* === Calibration plot === */}
      <div className="w-full text-center" style={{ minHeight: "400px" }}>
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

      {/* === Buttons section === */}
      <div className="flex flex-col items-center justify-center mt-6 w-full">
        {hasMave && (
          <div className="mb-2 w-full flex justify-center">
            <a
              href={`/mave/${gene}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-[#dbeafe] text-[#1d4ed8] font-semibold rounded-md hover:bg-[#bfdbfe] transition"
              style={{ textAlign: "center", display: "inline-block" }}
            >
              View MAVE Info
            </a>
          </div>
        )}

        {gene && (
          <div className="w-full flex justify-center">
            <button
              onClick={() => setShowGenes(!showGenes)}
              className="px-4 py-2 bg-[#77A9D8] text-white font-semibold rounded-md hover:bg-[#5f94cc] transition"
            >
              {showGenes ? "Hide TRN rankings" : "Click here to see TRN rankings"}
            </button>
          </div>
        )}
      </div>



      {/* === Scrollable TRN list === */}
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

      {/* === Info section toggle — stays at bottom === */}
      <div className="w-full flex justify-start mt-auto pt-4">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="mt-4 px-4 py-2 rounded-md border font-medium flex items-center justify-center gap-2 transition-colors"
          style={{
            backgroundColor: "white",
            color: "#77A9D8",
            borderColor: "#77A9D8",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#f2f7fc";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          <span>{showInfo ? "▼" : "▶"}</span>
          <span>What does this analysis show?</span>
        </button>
      </div>

      {/* === Info section content === */}
      {showInfo && (
        <div className="text-sm text-gray-700 bg-gray-50 border rounded-md p-3 mt-2 w-full max-w-3xl">
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
    </div>
  );
}

