"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useState } from "react";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel2Flatmap({ gene }: { gene: string }) {
  const [pathways, setPathways] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [loading1, setLoading1] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [selected2, setSelected2] = useState<string>("");
  const [imgUrl2, setImgUrl2] = useState<string | null>(null);
  const [svgUrl2, setSvgUrl2] = useState<string | null>(null);
  const [loading2, setLoading2] = useState(false);

  const [summary1, setSummary1] = useState<string>("");
  const [summary2, setSummary2] = useState<string>("");

  useEffect(() => {
    if (!gene || !gene.trim()) {
      setPathways([]);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${BACKEND}/flatmap/pathways?gene=${encodeURIComponent(gene)}`,
          { mode: "cors" }
        );
        const data = await res.json();
        setPathways(data.pathways || []);
      } catch (err) {
        console.error("Error fetching pathways", err);
      }
    })();
  }, [gene]);

  useEffect(() => {
    if (!gene || !gene.trim()) {
      setImgUrl(null);
      setSvgUrl(null);
      return;
    }

    setLoading1(true);

    const baseUrl = selected
      ? `${BACKEND}/flatmap/image?gene=${encodeURIComponent(
          gene
        )}&name=${encodeURIComponent(selected)}`
      : `${BACKEND}/flatmap/image?gene=${encodeURIComponent(gene)}`;

    setImgUrl(baseUrl);
    setSvgUrl(`${baseUrl}&format=svg`);
  }, [gene, selected]);

  useEffect(() => {
    if (!compareMode || !gene || !gene.trim()) {
      setImgUrl2(null);
      setSvgUrl2(null);
      return;
    }

    setLoading2(true);

    const baseUrl2 = selected2
      ? `${BACKEND}/flatmap/image?gene=${encodeURIComponent(
          gene
        )}&name=${encodeURIComponent(selected2)}`
      : `${BACKEND}/flatmap/image?gene=${encodeURIComponent(gene)}`;

    setImgUrl2(baseUrl2);
    setSvgUrl2(`${baseUrl2}&format=svg`);
  }, [gene, selected2, compareMode]);

  useEffect(() => {
    if (!gene || !gene.trim()) {
      setSummary1("");
      return;
    }

    const fetchSummary = async () => {
      try {
        const endpoint = selected
          ? `${BACKEND}/flatmap/summary?gene=${encodeURIComponent(
              gene
            )}&pathway=${encodeURIComponent(selected)}`
          : `${BACKEND}/flatmap/summary?gene=${encodeURIComponent(gene)}`;

        const res = await fetch(endpoint, { mode: "cors" });
        const data = await res.json();
        setSummary1(data.summary || "");
      } catch (err) {
        console.error("Error fetching summary1", err);
        setSummary1("");
      }
    };

    fetchSummary();
  }, [gene, selected]);

  useEffect(() => {
    if (!compareMode || !gene || !gene.trim()) {
      setSummary2("");
      return;
    }

    const fetchSummary2 = async () => {
      try {
        const endpoint2 = selected2
          ? `${BACKEND}/flatmap/summary?gene=${encodeURIComponent(
              gene
            )}&pathway=${encodeURIComponent(selected2)}`
          : `${BACKEND}/flatmap/summary?gene=${encodeURIComponent(gene)}`;

        const res = await fetch(endpoint2, { mode: "cors" });
        const data = await res.json();
        setSummary2(data.summary || "");
      } catch (err) {
        console.error("Error fetching summary2", err);
        setSummary2("");
      }
    };

    fetchSummary2();
  }, [gene, selected2, compareMode]);

  async function downloadSvg(url: string, geneName: string, pathway?: string) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const safeGene = geneName.toUpperCase().replace(/\s+/g, "_");
      const safePathway = pathway?.trim()
        ? pathway.replace(/\s+/g, "_")
        : "flatmap";
      const filename = `${safeGene}_${safePathway}.svg`;

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("SVG download failed", err);
    }
  }

  return (
    <div key={gene} className="transition-opacity duration-300 opacity-100">
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
      </div>

      <div
        className={`grid ${
          compareMode ? "grid-cols-2" : "grid-cols-1"
        } gap-4 justify-items-center`}
      >
        <div className="flex flex-col items-center w-full">
          <div className="border rounded-lg shadow bg-white p-2 flex flex-col justify-center items-center relative min-h-[480px] w-full">
            {!gene ? (
              <p className="text-gray-500">No gene selected.</p>
            ) : imgUrl ? (
              <>
                <div className="w-full flex justify-end mb-2">
                  {svgUrl && (
                    <button
                      type="button"
                      onClick={() => downloadSvg(svgUrl, gene, selected)}
                      className="border rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium"
                    >
                      Save as SVG
                    </button>
                  )}
                </div>

                {loading1 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                    <div className="flex flex-col items-center text-gray-600">
                      <div className="h-6 w-6 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                      <p className="text-sm">Loading flatmap...</p>
                    </div>
                  </div>
                )}

                <img
                  key={`flatmap1-${gene}-${selected}`}
                  src={imgUrl}
                  alt={`${gene} Flatmap`}
                  style={{
                    width: "90%",
                    maxHeight: "480px",
                    objectFit: "contain",
                  }}
                  onLoad={() => setLoading1(false)}
                  onError={() => setLoading1(false)}
                />
              </>
            ) : (
              <p className="text-gray-500">Loading flatmap...</p>
            )}
          </div>

          {summary1 && (
            <p className="mt-2 text-sm italic text-gray-700 text-center max-w-sm">
              {summary1}
            </p>
          )}
        </div>

        {compareMode && (
          <div className="flex flex-col items-center w-full">
            <div className="border rounded-lg shadow bg-white p-2 flex flex-col justify-center items-center relative min-h-[480px] w-full">
              {!gene ? (
                <p className="text-gray-500">No gene selected.</p>
              ) : imgUrl2 ? (
                <>
                  <div className="w-full flex justify-end mb-2">
                    {svgUrl2 && (
                      <button
                        type="button"
                        onClick={() => downloadSvg(svgUrl2, gene, selected2)}
                        className="border rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium"
                      >
                        Save as SVG
                      </button>
                    )}
                  </div>

                  {loading2 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                      <div className="flex flex-col items-center text-gray-600">
                        <div className="h-6 w-6 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                        <p className="text-sm">Loading flatmap...</p>
                      </div>
                    </div>
                  )}

                  <img
                    key={`flatmap2-${gene}-${selected2}`}
                    src={imgUrl2}
                    alt={`${gene} Comparison Flatmap`}
                    style={{
                      width: "90%",
                      maxHeight: "480px",
                      objectFit: "contain",
                    }}
                    onLoad={() => setLoading2(false)}
                    onError={() => setLoading2(false)}
                  />
                </>
              ) : (
                <p className="text-gray-500">Loading comparison flatmap...</p>
              )}
            </div>

            {summary2 && (
              <p className="mt-2 text-sm italic text-gray-700 text-center max-w-sm">
                {summary2}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={() => setCompareMode(!compareMode)}
          className="border rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200"
        >
          {compareMode ? "Cancel Compare" : "Compare Two Flatmaps"}
        </button>

        {compareMode && (
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
        )}
      </div>
    </div>
  );
}