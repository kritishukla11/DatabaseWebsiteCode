"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useState } from "react";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

type DrugRanking = {
  drug: string;
  score: number;
};

export default function Panel4AUPRC({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [showRankings, setShowRankings] = useState(false);
  const [rankings, setRankings] = useState<DrugRanking[]>([]);

  // --- Check if plot/data exists ---
  useEffect(() => {
    if (!gene || !gene.trim()) {
      setImgUrl(null);
      setLoading(false);
      setError("");
      setSummary("");
      setShowRankings(false);
      setRankings([]);
      return;
    }

    const fetchPlot = async () => {
      setLoading(true);
      setError("");
      setImgUrl(null);
      setSummary("");
      setShowRankings(false);
      setRankings([]);

      try {
        const res = await fetch(
          `${BACKEND}/confidence/image?protein=${encodeURIComponent(gene)}`,
          { mode: "cors" }
        );

        const contentType = res.headers.get("content-type") || "";

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            data.error ||
              "There is no Tahoe-100M drug association data for this protein."
          );
          setImgUrl(null);
          setLoading(false);
          return;
        }

        // endpoint returns image even for no-data, so just use it
        // but we still want button hidden if rankings are empty; we'll control that separately
        if (contentType.includes("image")) {
          setImgUrl(
            `${BACKEND}/confidence/image?protein=${encodeURIComponent(gene)}`
          );
        } else {
          setError("There is no Tahoe-100M drug association data for this protein.");
          setImgUrl(null);
        }
      } catch (err) {
        setError("There is no Tahoe-100M drug association data for this protein.");
        setImgUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPlot();
  }, [gene]);

  // --- Load summary only if no error ---
  useEffect(() => {
    if (!gene || error) {
      setSummary("");
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${BACKEND}/confidence/summary?protein=${encodeURIComponent(gene)}`,
          { mode: "cors" }
        );
        const data = await res.json();
        setSummary(data.summary || "");
      } catch (err) {
        console.error("Error fetching confidence summary:", err);
        setSummary("");
      }
    })();
  }, [gene, error]);

  // --- Load rankings only when toggled ---
  useEffect(() => {
    if (showRankings && gene && gene.trim() && !error) {
      fetch(`${BACKEND}/confidence/rankings?protein=${encodeURIComponent(gene)}`, {
        mode: "cors",
      })
        .then((res) => res.json())
        .then((data) => setRankings(data.rankings || []))
        .catch(() => setRankings([]));
    }
  }, [showRankings, gene, error]);

  // --- Pre-check whether rankings exist so button only appears when data exists ---
  const [hasRankings, setHasRankings] = useState(false);

  useEffect(() => {
    if (!gene || !gene.trim() || error) {
      setHasRankings(false);
      return;
    }

    fetch(`${BACKEND}/confidence/rankings?protein=${encodeURIComponent(gene)}`, {
      mode: "cors",
    })
      .then((res) => res.json())
      .then((data) => {
        setHasRankings(Array.isArray(data.rankings) && data.rankings.length > 0);
      })
      .catch(() => setHasRankings(false));
  }, [gene, error]);

  return (
    <div className="border rounded-lg shadow bg-white p-4 flex flex-col items-center min-h-[650px]">
      {/* === Summary sentence === */}
      {!error && summary && (
        <p className="text-sm italic text-gray-700 text-center max-w-md mb-4 transition-opacity duration-500">
          {summary}
        </p>
      )}

      {/* === Plot area === */}
      <div className="w-full text-center" style={{ minHeight: "400px" }}>
        {!gene ? (
          <p className="text-gray-500">No gene selected.</p>
        ) : loading ? (
          <p className="text-gray-500">Loading plot...</p>
        ) : error ? (
          <p className="text-gray-500">{error}</p>
        ) : !imgUrl ? (
          <p className="text-gray-500">Loading plot...</p>
        ) : (
          <img
            key={`expr-${gene}`}
            src={imgUrl}
            alt={`Drug confidence plot for ${gene}`}
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

      {/* === Button only if there is data === */}
      {gene && !error && hasRankings && (
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="mt-4 px-4 py-2 bg-[#77A9D8] text-white font-semibold rounded-md hover:bg-[#5f94cc] transition"
        >
          {showRankings ? "Hide drug rankings" : "Click here to see ranked drugs"}
        </button>
      )}

      {/* === Rankings list === */}
      {showRankings && !error && rankings.length > 0 && (
        <div
          className="mt-3 border rounded bg-gray-50 w-full max-w-md p-2"
          style={{ maxHeight: "300px", overflowY: "auto" }}
        >
          <ul>
            {rankings.map((r, i) => (
              <li
                key={i}
                className="border-b last:border-none py-1 text-left flex justify-between gap-3"
              >
                <span>
                  {i + 1}. {r.drug}
                </span>
                <span className="text-gray-600">{r.score.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}