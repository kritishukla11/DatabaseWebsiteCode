"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0; 

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel4AUPRC({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [showRankings, setShowRankings] = useState(false);
  const [rankings, setRankings] = useState<{ drug: string; auprc: number }[]>([]);

  // set plot URL directly
  useEffect(() => {
    if (!gene) {
      setImgUrl(null);
      return;
    }
    const url = `${BACKEND}/auprc/image?gene=${encodeURIComponent(
      gene
    )}&_ts=${Date.now()}`;
    console.log("AUPRC image URL:", url);
    setImgUrl(url);
  }, [gene]);

  // fetch rankings when toggled open
  useEffect(() => {
    if (showRankings && gene) {
      fetch(`${BACKEND}/auprc/rankings?gene=${encodeURIComponent(gene)}`)
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
      {/* plot */}
      <div style={{ minHeight: "400px", width: "100%", textAlign: "center" }}>
        {!gene ? (
          <p className="text-gray-500">No gene selected.</p>
        ) : !imgUrl ? (
          <p className="text-gray-500">Loading AUPRC plot...</p>
        ) : (
          <img
            key={`auprc-${gene}-${imgUrl}`} // ✅ unique key
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

      {/* button */}
      {gene && (
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {showRankings ? "Hide drug rankings" : "Click here to see rankings of drugs"}
        </button>
      )}

      {/* scrollable list */}
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




