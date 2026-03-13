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
  const [hasRankings, setHasRankings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!gene || !gene.trim()) {
      setImgUrl(null);
      setLoading(false);
      setError("");
      setSummary("");
      setShowRankings(false);
      setRankings([]);
      setHasRankings(false);
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
          return;
        }

        if (contentType.includes("image")) {
          setImgUrl(
            `${BACKEND}/confidence/image?protein=${encodeURIComponent(gene)}`
          );
        } else {
          setError(
            "There is no Tahoe-100M drug association data for this protein."
          );
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
      } catch {
        setSummary("");
      }
    })();
  }, [gene, error]);

  useEffect(() => {
    if (!gene || !gene.trim() || error) {
      setHasRankings(false);
      return;
    }

    fetch(`${BACKEND}/confidence/rankings?protein=${encodeURIComponent(gene)}`, {
      mode: "cors",
    })
      .then((res) => res.json())
      .then((data) =>
        setHasRankings(Array.isArray(data.rankings) && data.rankings.length > 0)
      )
      .catch(() => setHasRankings(false));
  }, [gene, error]);

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

  return (
    <div className="border rounded-lg shadow bg-white p-4 flex flex-col items-center min-h-[650px]">
      
      {/* Summary */}
      {!error && summary && (
        <p className="text-sm italic text-gray-700 text-center max-w-md mb-4">
          {summary}
        </p>
      )}

      {/* Plot */}
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

      {/* Rankings button */}
      {gene && !error && hasRankings && (
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="mt-4 px-4 py-2 bg-[#77A9D8] text-white font-semibold rounded-md hover:bg-[#5f94cc] transition"
        >
          {showRankings ? "Hide drug rankings" : "Click here to see drug rankings and log odds of association scores"}
        </button>
      )}

      {/* Rankings list */}
      {showRankings && !error && rankings.length > 0 && (
        <div
          className="mt-3 border rounded bg-gray-50 w-full max-w-md p-2"
          style={{ maxHeight: "300px", overflowY: "auto" }}
        >
          <ul>
            {rankings.map((r, i) => (
              <li key={i} className="border-b last:border-none py-1 text-left">
                {i + 1}. {r.drug} - {r.score.toFixed(3)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info toggle button */}
      <div className="w-full flex justify-start mt-auto pt-4">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="mt-4 px-4 py-2 rounded-md border font-medium flex items-center gap-2 transition-colors"
          style={{
            backgroundColor: "white",
            color: "#77A9D8",
            borderColor: "#77A9D8",
          }}
        >
          <span>{showInfo ? "▼" : "▶"}</span>
          <span>What does this analysis show?</span>
        </button>
      </div>

      {/* Info content */}
      {showInfo && (
        <div className="text-sm text-gray-700 bg-gray-50 border rounded-md p-3 mt-2 w-full max-w-3xl">
          <p className="mb-2">
            To evaluate whether predicted protein–drug relationships are supported
            by experimental data, we integrate results from the
            <b> Tahoe-100M perturbation dataset</b>.
          </p>

          <p className="mb-2">
            Tahoe-100M systematically measures how thousands of small molecules
            affect gene expression across many cellular contexts. These data
            allow us to quantify how strongly a drug perturbs transcriptional
            programs associated with specific genes.
          </p>

          <p className="mb-2">
            For each protein, we rank drugs based on the strongest
            region-specific association scores derived from structural mutation
            hotspots, AI, and log odds analysis.
          </p>

          <p>
            The calibration curve compares predicted drug rankings with
            experimentally observed confidence values, illustrating how well
            AI-derived protein–drug associations align with large-scale
            perturbation data.
          </p>
        </div>
      )}
    </div>
  );
}