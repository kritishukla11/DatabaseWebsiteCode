"use client";

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel2Flatmap({ gene }: { gene: string }) {
  const [pathways, setPathways] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const [compareMode, setCompareMode] = useState(false);
  const [selected2, setSelected2] = useState<string>("");
  const [imgUrl2, setImgUrl2] = useState<string | null>(null);

  // Load available pathways when gene changes
  useEffect(() => {
    if (!gene) {
      setPathways([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/flatmap/pathways?gene=${gene}`);
        const data = await res.json();
        setPathways(data.pathways || []);
      } catch (err) {
        console.error("Error fetching pathways", err);
      }
    })();
  }, [gene]);

  // Build image URL for main flatmap
  useEffect(() => {
    if (!gene) {
      setImgUrl(null);
      return;
    }
    const url = selected
      ? `${BACKEND}/flatmap/image?gene=${gene}&name=${encodeURIComponent(
          selected
        )}&_ts=${Date.now()}`
      : `${BACKEND}/flatmap/image?gene=${gene}&_ts=${Date.now()}`;
    setImgUrl(url);
  }, [gene, selected]);

  // Build image URL for comparison flatmap (if enabled)
  useEffect(() => {
    if (!compareMode || !gene) {
      setImgUrl2(null);
      return;
    }
    const url2 = selected2
      ? `${BACKEND}/flatmap/image?gene=${gene}&name=${encodeURIComponent(
          selected2
        )}&_ts=${Date.now()}`
      : `${BACKEND}/flatmap/image?gene=${gene}&_ts=${Date.now()}`;
    setImgUrl2(url2);
  }, [gene, selected2, compareMode]);

  return (
    <div>
      <div className="flex gap-3 items-center mb-3">
        <select
          className="border rounded-lg px-3 py-2"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Default (cluster colors)</option>
          {pathways.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <button
          onClick={() => setCompareMode(!compareMode)}
          className="border rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200"
        >
          {compareMode ? "Cancel Compare" : "Compare Two Flatmaps"}
        </button>
      </div>

      {compareMode && (
        <div className="flex gap-3 items-center mb-3">
          <select
            className="border rounded-lg px-3 py-2"
            value={selected2}
            onChange={(e) => setSelected2(e.target.value)}
          >
            <option value="">Default (cluster colors)</option>
            {pathways.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Two-column layout if comparing, else one */}
      <div
        className={`grid ${
          compareMode ? "grid-cols-2" : "grid-cols-1"
        } gap-4 justify-items-center`}
      >
        {/* First flatmap */}
        <div className="border rounded-lg shadow bg-white p-2 flex justify-center items-center">
          {!gene ? (
            <p className="text-gray-500">No gene selected.</p>
          ) : !imgUrl ? (
            <p className="text-gray-500">Loading flatmap...</p>
          ) : (
            <img
              key={`flatmap1-${imgUrl}`}
              src={imgUrl}
              alt={`${gene} Flatmap`}
              style={{
                width: "90%",
                maxHeight: "480px",
                objectFit: "contain",
              }}
            />
          )}
        </div>

        {/* Second flatmap (if compare mode) */}
        {compareMode && (
          <div className="border rounded-lg shadow bg-white p-2 flex justify-center items-center">
            {!gene ? (
              <p className="text-gray-500">No gene selected.</p>
            ) : !imgUrl2 ? (
              <p className="text-gray-500">Loading comparison flatmap...</p>
            ) : (
              <img
                key={`flatmap2-${imgUrl2}`}
                src={imgUrl2}
                alt={`${gene} Comparison Flatmap`}
                style={{
                  width: "90%",
                  maxHeight: "480px",
                  objectFit: "contain",
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
