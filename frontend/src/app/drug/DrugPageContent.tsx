"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function DrugPageContent() {
  const searchParams = useSearchParams();
  const drugParam = searchParams.get("drug") || "";
  const cleanedDrug = drugParam.toLowerCase().trim();

  const [panel1Data, setPanel1Data] = useState<any>(null);
  const [proteinList, setProteinList] = useState<string[]>([]);
  const [selectedProtein, setSelectedProtein] = useState<string>("");
  const [flatmapUrl, setFlatmapUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pubchemError, setPubchemError] = useState<string | null>(null);

  useEffect(() => {
    if (!drugParam) return;

    async function fetchDrug() {
      setError(null);
      setPubchemError(null);
      setPanel1Data(null);

      try {
        const resp = await fetch(`${BACKEND}/drugs/list`);
        const listJson = await resp.json();
        const knownDrugs = (listJson.drugs || []).map((d: string) =>
          d.toLowerCase().trim()
        );

        if (!knownDrugs.includes(cleanedDrug)) {
          setError(`No data available for “${drugParam}”.`);
          return;
        }

        let cid = null;
        try {
          const cidResp = await fetch(
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
              cleanedDrug
            )}/cids/JSON`
          );
          if (!cidResp.ok) throw new Error("Failed to get CID");
          const cidJson = await cidResp.json();
          cid = cidJson?.IdentifierList?.CID?.[0];
          if (!cid) throw new Error("No PubChem CID found");
        } catch {
          setPubchemError("Can't find entry in PubChem");
        }

        let description = "No description available";
        let structureUrlVal = null;

        if (cid) {
          try {
            const summaryResp = await fetch(
              `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON`
            );
            if (summaryResp.ok) {
              const summaryJson = await summaryResp.json();

              function extractSections(section: any): any[] {
                if (!section) return [];
                const list = Array.isArray(section) ? section : [section];
                return list.flatMap((s: any) => {
                  const subs = s.Section ? extractSections(s.Section) : [];
                  return [s, ...subs];
                });
              }

              const sections = extractSections(summaryJson?.Record?.Section);
              const descCandidates = [
                "Description",
                "Pharmacology",
                "Pharmacology and Biochemistry",
                "Therapeutic Uses",
                "Drug Indication",
                "Mechanism of Action",
                "Drug and Medication Information",
              ];

              const texts: string[] = sections
                .filter((s: any) => descCandidates.includes(s?.TOCHeading))
                .map(
                  (s: any) =>
                    s?.Information?.[0]?.Value?.StringWithMarkup?.[0]?.String?.trim() ||
                    ""
                )
                .filter((t) => t.length > 0);

              if (texts.length > 0) {
                description = texts.reduce((a, b) =>
                  a.length > b.length ? a : b
                );
              } else {
                const fallback =
                  summaryJson?.Record?.Description ||
                  summaryJson?.Record?.RecordTitle ||
                  null;
                if (fallback && fallback.trim().length > 0) {
                  description = fallback.trim();
                }
              }
            }

            structureUrlVal = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG`;
          } catch {
            setPubchemError("Can't find entry in PubChem");
          }
        }

        setPanel1Data({
          cid,
          structureUrl: structureUrlVal,
          description,
        });
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Error fetching drug info");
      }
    }

    fetchDrug();
  }, [drugParam, cleanedDrug]);

  useEffect(() => {
    if (!drugParam) return;

    async function fetchProteins() {
      try {
        const resp = await fetch(
          `${BACKEND}/flatmap/proteins?drug=${encodeURIComponent(cleanedDrug)}`
        );
        if (!resp.ok) throw new Error("Failed to fetch protein list");
        const data = await resp.json();
        setProteinList(data.proteins || []);
      } catch (err) {
        console.error("Protein fetch error:", err);
        setProteinList([]);
      }
    }

    fetchProteins();
  }, [drugParam, cleanedDrug]);

  useEffect(() => {
    if (!drugParam || !selectedProtein) {
      setFlatmapUrl(null);
      setSvgUrl(null);
      return;
    }

    const baseUrl = `${BACKEND}/flatmap/drug?gene=${encodeURIComponent(
      selectedProtein
    )}&drug=${encodeURIComponent(cleanedDrug)}`;

    setFlatmapUrl(baseUrl);
    setSvgUrl(`${baseUrl}&format=svg`);
  }, [drugParam, selectedProtein, cleanedDrug]);

  async function downloadSvg(url: string, geneName: string, drugName: string) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const safeGene = geneName.toUpperCase().replace(/\s+/g, "_");
      const safeDrug = drugName.trim().replace(/\s+/g, "_");
      const filename = `${safeGene}_${safeDrug}.svg`;

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
    <main className="container">
      {error ? (
        <div className="error-page">
          <h1 className="title">Results for: {drugParam}</h1>
          <p className="error">{error}</p>
        </div>
      ) : (
        <>
          <h1 className="title">Results for: {drugParam}</h1>

          <div className="panel-row">
            <div className="panel half">
              <h2 className="panel-title">Drug Information</h2>
              {pubchemError ? (
                <p style={{ color: "gray" }}>
                  {pubchemError}.{" "}
                  <a
                    href={`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(
                      drugParam
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#4B9CD3",
                      textDecoration: "underline",
                      marginLeft: "4px",
                    }}
                  >
                    Search on PubChem
                  </a>
                </p>
              ) : !panel1Data ? (
                <p>Loading…</p>
              ) : (
                <div>
                  {panel1Data.structureUrl && (
                    <img
                      src={panel1Data.structureUrl}
                      alt={`${drugParam} structure`}
                      style={{
                        maxWidth: "280px",
                        marginBottom: "1rem",
                        border: "1px solid #ccc",
                        borderRadius: "8px",
                      }}
                    />
                  )}
                  <p className="description-text">
                    {panel1Data.description || "No description available."}
                  </p>
                </div>
              )}
            </div>

            <div className="panel half">
              <h2 className="panel-title">Drug Flatmaps</h2>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="proteinSelect"
                  style={{ fontWeight: 600, marginRight: "0.5rem" }}
                >
                  Select Protein:
                </label>
                <select
                  id="proteinSelect"
                  value={selectedProtein}
                  onChange={(e) => setSelectedProtein(e.target.value)}
                  style={{
                    padding: "0.4rem",
                    borderRadius: "6px",
                    border: "1px solid #7bafd4",
                    color: "#333",
                    fontWeight: 500,
                  }}
                >
                  <option value="">(Select a protein)</option>
                  {proteinList.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {flatmapUrl ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {svgUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadSvg(svgUrl, selectedProtein, cleanedDrug)
                        }
                        style={{
                          padding: "0.45rem 0.8rem",
                          borderRadius: "6px",
                          border: "1px solid #7bafd4",
                          background: "#f1f9ff",
                          color: "#333",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Save as SVG
                      </button>
                    )}
                  </div>

                  <img
                    src={flatmapUrl}
                    alt={`${selectedProtein} flatmap`}
                    style={{
                      width: "100%",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    }}
                  />
                </>
              ) : (
                <p style={{ color: "#666" }}>
                  Select a protein to view its cluster flatmap.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .error {
          color: red;
          font-size: 1.2rem;
          text-align: center;
        }
        .error-page {
          text-align: center;
          padding: 4rem 1rem;
        }
        .container {
          background: #ffffff;
          min-height: 100vh;
          padding: 12px;
        }
        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 1rem;
        }
        .panel {
          background: white;
          border: 2px solid #7bafd4;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .panel-title {
          color: #7bafd4;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .panel-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .description-text {
          color: #333;
          margin-bottom: 1.2rem;
          font-size: 0.95rem;
        }
      `}</style>
    </main>
  );
}