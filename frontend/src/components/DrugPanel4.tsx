"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useState } from "react";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function DrugPanel4({ drug }: { drug: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [showRankings, setShowRankings] = useState(false);
  const [rankings, setRankings] = useState<{ gene: string; expression: number }[]>(
    []
  );

  // --- Load protein-expression plot ---
  useEffect(() => {
    if (!drug || !drug.trim()) {
      setImgUrl(null);
      return;
    }
    const url = `${BACKEND}/drug_expression/image?drug=${encodeURIComponent(drug)}`;
    setImgUrl(url);
  }, [drug]);

  // --- Fetch rankings when toggled ---
  useEffect(() => {
    if (showRankings && drug && drug.trim()) {
      fetch(`${BACKEND}/drug_expression/rankings?drug=${encodeURIComponent(drug)}`, {
        mode: "cors",
      })
        .then((res) => res.json())
        .then((data) => setRankings(data.rankings || []))
        .catch((err) => {
          console.error("Error fetching protein rankings:", err);
          setRankings([]);
        });
    }
  }, [showRankings, drug]);

  return (
    <div className="border rounded-lg shadow bg-white p-2 flex flex-col items-center">
      {/* === Plot === */}
      <div style={{ minHeight: "400px", width: "100%", textAlign: "center" }}>
        {!drug ? (
          <p className="text-gray-500">No drug selected.</p>
        ) : !imgUrl ? (
          <p className="text-gray-500">Loading protein-expression plot...</p>
        ) : (
          <img
            key={`drugexpr-${drug}`}
            src={imgUrl}
            alt={`Protein-expression plot for ${drug}`}
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
      {drug && (
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="mt-4 px-4 py-2 bg-[#77A9D8] text-white font-semibold rounded-md hover:bg-[#5f94cc] transition"
        >
          {showRankings
            ? "Hide ranked proteins"
            : "Click here to see ranked proteins"}
        </button>
      )}

      {/* === Scrollable list === */}
      {showRankings && rankings.length > 0 && (
        <div
          className="mt-3 border rounded bg-gray-50 w-full max-w-md p-2"
          style={{ maxHeight: "300px", overflowY: "auto" }}
        >
          <ul>
            {rankings.map((r, i) => (
              <li key={i} className="border-b last:border-none py-1 text-left">
                {i + 1}. {r.gene} – {r.expression.toFixed(3)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
