"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useState } from "react";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel4AUPRC({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [showRankings, setShowRankings] = useState(false);
  const [rankings, setRankings] = useState<{ drug: string; auprc: number }[]>(
    []
  );

  // --- Load AUPRC plot ---
  useEffect(() => {
    if (!gene || !gene.trim()) {
      setImgUrl(null);
      return;
    }

    const url = `${BACKEND}/auprc/image?gene=${encodeURIComponent(gene)}`;
    setImgUrl(url);
  }, [gene]);

  // --- Fetch drug rankings when toggled open ---
  useEffect(() => {
    if (showRankings && gene && gene.trim()) {
      fetch(`${BACKEND}/auprc/rankings?gene=${encodeURIComponent(gene)}`, {
        mode: "cors",
      })
        .then((res) => {
          if (!res.ok) throw new Error("Rankings fetch failed");
          return res.json();
        })
        .then((data) => setRankings(data.rankings || []))
        .catch((err) => {
          console.error("Error fetching rankings:", err);
          setRankings([]);
        });
    }
  }, [showRankings, gene]);

  return (
    <div className="border rounded-lg shadow bg-white p-2 flex flex-col items-center">
      {/* === Plot === */}
      <div style={{ minHeight: "400px", width: "100%", textAlign: "center" }}>
        {!gene ? (
          <p className="text-gray-500">No gene selected.</p>
        ) : !imgUrl ? (
          <p className="text-gray-500">Loading AUPRC plot...</p>
        ) : (
          <img
            key={`auprc-${gene}`}
            src={imgUrl}
            alt={`AUPRC plot for ${gene}`}
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

      {/* === Button === */}
      {gene && (
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="mt-4 px-4 py-2 bg-[#77A9D8] text-white font-semibold rounded-md hover:bg-[#5f94cc] transition"
        >
          {showRankings
            ? "Hide drug rankings"
            : "Click here to see rankings of drugs"}
        </button>
      )}

      {/* === Scrollable drug list === */}
      {showRankings && rankings.length > 0 && (
        <div
          className="mt-3 border rounded bg-gray-50 w-full max-w-md p-2"
          style={{ maxHeight: "300px", overflowY: "auto" }}
        >
          <ul>
            {rankings.map((r, i) => (
              <li key={i} className="border-b last:border-none py-1 text-left">
                {i + 1}. {r.drug} – {r.auprc.toFixed(3)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}




