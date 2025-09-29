"use client";

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel3Calibration({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [showGenes, setShowGenes] = useState(false);
  const [genes, setGenes] = useState<{ gene: string; confidence: number }[]>([]);

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

  // fetch partner genes for this query gene
  useEffect(() => {
    if (showGenes && gene) {
      fetch(`${BACKEND}/calibration/genes?gene=${encodeURIComponent(gene)}`)
        .then((res) => res.json())
        .then((data) => setGenes(data.genes || []))
        .catch((err) => {
          console.error("Error fetching partner genes:", err);
          setGenes([]);
        });
    }
  }, [showGenes, gene]);

  return (
    <div className="border rounded-lg shadow bg-white p-2 flex flex-col items-center">
      {/* plot */}
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

      {/* button */}
      {gene && (
        <button
          onClick={() => setShowGenes(!showGenes)}
          className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          {showGenes ? "Hide TRN rankings" : "Click here to see TRN rankings"}
        </button>
      )}

      {/* scrollable list */}
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





