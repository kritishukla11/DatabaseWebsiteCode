"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import Panel2Flatmap from "@/components/Panel2Flatmap";
import Panel3Calibration from "@/components/Panel3Calibration";
import Panel4AUPRC from "@/components/Panel4AUPRC";

const Plot = nextDynamic(() => import("react-plotly.js"), { ssr: false });
const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function SearchPageContent() {
  const searchParams = useSearchParams();
  const gene = searchParams.get("gene") || "";

  const [plotJson, setPlotJson] = useState<any>(null);
  const [neighbors, setNeighbors] = useState<any[]>([]);
  const [selectedGene, setSelectedGene] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);

  const [iframeHeights, setIframeHeights] = useState<Record<string, number>>({});
  const [sharedGroups, setSharedGroups] = useState<any[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const [selectedInfoGene, setSelectedInfoGene] = useState<string>("");
  const [geneInfo, setGeneInfo] = useState<Record<string, string[]> | null>(
    null
  );
  const [expandedInfoGroup, setExpandedInfoGroup] = useState<string | null>(
    null
  );
  

  // --- Resize listener ---
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "resize-panel" && event.data.panel === "panel1") {
        setIframeHeights((prev) => ({
          ...prev,
          [event.data.panel]: event.data.height || 600,
        }));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // --- Group label ---
  useEffect(() => {
    if (!gene.trim()) return;
    fetch(`${BACKEND}/group_label?gene=${encodeURIComponent(gene)}`, {
      mode: "cors",
    })
      .then((res) => res.json())
      .then((data) => setGroupLabel(data.group_label || null))
      .catch(() => setGroupLabel(null));
  }, [gene]);

  // --- Network plot + neighbors ---
  useEffect(() => {
    if (!gene.trim()) return;

    fetch(`${BACKEND}/check_gene?gene=${encodeURIComponent(gene)}`, {
      mode: "cors",
    })
      .then((res) => {
        if (res.status === 404) {
          throw new Error(`Sorry, we don't have info for ${gene}.`);
        }
        return res.json();
      })
      .then(() =>
        fetch(`${BACKEND}/plot?gene=${encodeURIComponent(gene)}`, {
          mode: "cors",
        })
      )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setPlotJson(null);
          setNeighbors([]);
          return;
        }
        const sorted = (data.neighbors || []).sort(
          (a: any, b: any) => (b.cosine_sim ?? 0) - (a.cosine_sim ?? 0)
        );
        setPlotJson(data.plot);
        setNeighbors(sorted);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || "No data available for this gene.");
        setPlotJson(null);
        setNeighbors([]);
      });
  }, [gene]);

  // --- Shared TRN groups ---
  useEffect(() => {
    if (!gene.trim() || !selectedGene) {
      setSharedGroups([]);
      setExpandedGroup(null);
      return;
    }
    fetch(
      `${BACKEND}/shared_pathway_groups?query=${encodeURIComponent(
        gene
      )}&neighbor=${encodeURIComponent(selectedGene)}`,
      { mode: "cors" }
    )
      .then((res) => res.json())
      .then((data) => setSharedGroups(data.groups || []))
      .catch(() => setSharedGroups([]));
  }, [gene, selectedGene]);

  // --- Gene info ---
  useEffect(() => {
    if (!selectedInfoGene.trim()) {
      setGeneInfo(null);
      return;
    }
    fetch(`${BACKEND}/gene_info?gene=${encodeURIComponent(selectedInfoGene)}`, {
      mode: "cors",
    })
      .then((res) => res.json())
      .then((data) => setGeneInfo(data.info || {}))
      .catch(() => setGeneInfo(null));
  }, [selectedInfoGene]);

  return (
    <main className="container">
      {error ? (
        <div className="error-page">
          <h1 className="title">Results for: {gene}</h1>
          <p className="error">{error}</p>
        </div>
      ) : (
        <>
          <h1 className="title">Results for: {gene}</h1>

          {/* Row 1: Panel 1 + Panel 2 */}
          <div className="panel-row">
            <div className="panel half">
              <h2 className="panel-title">Interactive Protein Structure</h2>
              {gene ? (
                <iframe
                  src={`/panel1.html?gene=${encodeURIComponent(gene)}`}
                  id="panel1-iframe"
                  title="3D Protein Viewer"
                  style={{
                    width: "100%",
                    height: `${iframeHeights["panel1"] ?? 600}px`,
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    background: "white",
                  }}
                />
              ) : (
                <p>No gene selected.</p>
              )}
            </div>

            <div className="panel half panel2-container" key={`wrap-panel2-${gene}`}>
                <h2 className="panel-title">2D Protein Flatmap</h2>
                <div data-panel="2" className="panel-inner">
                    <Panel2Flatmap key={`panel2-${gene}`} gene={gene} />
                </div>
            </div>
          </div>


          {/* Row 2: Panel 3 + Panel 4 */}
          <div className="panel-row">
            <div
                className="panel half panel3-container"
                key={`wrap-panel3-${gene}`}
                style={{ minHeight: "600px", display: "flex", flexDirection: "column" }}
            >
                <h2 className="panel-title">
                    Perturb-Seq Based Confidence of Protein/TRN Association
                </h2>
                <div data-panel="3" className="panel-inner">
                    <Panel3Calibration key={`panel3-${gene}`} gene={gene} />
                </div>
            </div>

            <div className="panel half panel4-container" key={`wrap-panel4-${gene}`}>
                <h2 className="panel-title">Tahoe-100M Based Confidence of Protein/Drug Association</h2>
                <div data-panel="4" className="panel-inner">
                    <Panel4AUPRC key={`panel4-${gene}`} gene={gene} />
                </div>
            </div>
          </div>



          {/* Panel 5 full-width */}
          <div className="panel full panel5">
            <h2 className="panel-title">
              Protein Relationship Network Based on Common TRN Associations
            </h2>
            {groupLabel && (
              <p className="group-label">Group Annotation: {groupLabel}</p>
            )}
            <div className="network-container">
              <div className="plot-area">
                {plotJson ? (
                  <Plot
                    data={plotJson.data}
                    layout={{
                      ...plotJson.layout,
                      autosize: true,
                      margin: {
                        ...(plotJson.layout?.margin || {}),
                        l: 40,
                        r: 100,
                        t: 60,
                        b: 60,
                      },
                    }}
                    useResizeHandler
                    style={{ width: "100%", height: "650px" }}
                    config={{ responsive: true, displayModeBar: false }}
                  />
                ) : (
                  <p>Loading network...</p>
                )}
              </div>

              <aside className="sidebar">
                {/* Gene Info */}
                <div className="info-box">
                  <h3 className="sidebar-title">Gene Info</h3>
                  <select
                    className="dropdown"
                    value={selectedInfoGene}
                    onChange={(e) => setSelectedInfoGene(e.target.value)}
                  >
                    <option value="">Select a gene</option>
                    <option value={gene}>{gene}</option>
                    {neighbors.map((n) => (
                      <option key={n.protein_id} value={n.protein_id}>
                        {n.protein_id}
                      </option>
                    ))}
                  </select>

                  {!selectedInfoGene ? (
                    <p className="no-info">Select a gene</p>
                  ) : geneInfo && Object.keys(geneInfo).length > 0 ? (
                    <div className="group-buttons">
                      {Object.entries(geneInfo).map(([category, values], i) => (
                        <div key={i} className="group-block">
                          <button
                            className={`group-btn ${
                              expandedInfoGroup === category ? "active" : ""
                            }`}
                            onClick={() =>
                              setExpandedInfoGroup(
                                expandedInfoGroup === category ? null : category
                              )
                            }
                          >
                            {category}
                          </button>
                          {expandedInfoGroup === category && (
                            <ul className="info-list">
                              {(values as string[]).map((v, j) => (
                                <li key={j}>{v}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-info">No info available</p>
                  )}
                </div>

                {/* Shared Pathways */}
                <div className="pathway-box">
                  <h3 className="sidebar-title">Shared TRNs</h3>
                  <select
                    className="dropdown"
                    value={selectedGene}
                    onChange={(e) => setSelectedGene(e.target.value)}
                  >
                    <option value="">Select gene</option>
                    {neighbors.map((n) => (
                      <option key={n.protein_id} value={n.protein_id}>
                        {n.protein_id}
                      </option>
                    ))}
                  </select>

                  {selectedGene ? (
                    sharedGroups.length ? (
                      <div className="group-buttons">
                        {sharedGroups.map((g, i) => (
                          <div key={i} className="group-block">
                            <button
                              className={`group-btn ${
                                expandedGroup === g.Group10 ? "active" : ""
                              }`}
                              onClick={() =>
                                setExpandedGroup(
                                  expandedGroup === g.Group10 ? null : g.Group10
                                )
                              }
                            >
                              {g.Group10}
                            </button>
                            {expandedGroup === g.Group10 && (
                              <ul className="pathway-list">
                                {g.pathways.map((p: any, j: number) => (
                                  <li key={j}>
                                    {p.pathway_id} —{" "}
                                    <span className="score">
                                      {p.joint_score.toFixed(3)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-pathways">No shared TRNs found.</p>
                    )
                  ) : (
                    <p className="no-pathways">Select a neighbor gene</p>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .container {
          background: #ffffff;
          min-height: 100vh;
          width: 100%;
          margin: 0;
          padding: 12px;
          box-sizing: border-box;
        }
        body {
          background: #ffffff;
        }
        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 1rem;
        }
        .home-link {
          color: #7bafd4;
          font-weight: 700;
          font-size: 1.1rem;
          text-decoration: none;
        }
        .home-link:hover {
          text-decoration: underline;
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
        .group-label {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 0.75rem;
        }
        .panel-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .panel.full {
          width: 100%;
          margin-bottom: 2rem;
        }
        .panel5 {
          padding: 2rem;
          overflow: visible;
        }
        .network-container {
          display: flex;
          gap: 1.25rem;
          align-items: stretch;
        }
        .plot-area {
          flex: 1;
          min-width: 0;
        }
        .sidebar {
          width: 300px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .info-box,
        .pathway-box {
          background: #f1f9ff;
          border: 1px solid #7bafd4;
          border-radius: 8px;
          padding: 1rem;
        }
        .gene-info-text {
          font-size: 0.9rem;
          color: #333;
          white-space: pre-line;
        }
        .no-info {
          color: #666;
          font-style: italic;
        }
        .sidebar-title {
          color: black;
          margin-bottom: 0.5rem;
        }
        .dropdown {
          width: 100%;
          padding: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .group-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .group-btn {
          width: 100%;
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-weight: 600;
          border: 1px solid #7bafd4;
          border-radius: 6px;
          background: #f1f9ff;
          color: #333;
          cursor: pointer;
          transition: background 0.2s;
        }
        .group-btn:hover {
          background: #dcefff;
        }
        .group-btn.active {
          background: #7bafd4;
          color: white;
        }
        .group-block ul {
          margin: 0.5rem 1rem;
          padding-left: 1rem;
          list-style: none;
          color: black;
        }
        .pathway-list li,
        .info-list li {
          display: flex;
          justify-content: space-between;
        }
        .pathway-list .score {
          color: #555;
          font-weight: 500;
        }
        .no-pathways {
          color: black;
        }
        .error {
          color: red;
          font-size: 1.2rem;
          text-align: center;
        }
        .error-page {
          text-align: center;
          padding: 4rem 1rem;
        }
        .panel2-container,
        .panel3-container,
        .panel4-container {
            background: white;
            position: relative;
            overflow: hidden;
        }

        .panel-inner {
            position: relative;
            width: 100%;
            height: 100%;
            z-index: 1;
        }
        @media (max-width: 900px) {
          .panel-row {
            grid-template-columns: 1fr;
          }
          .network-container {
            flex-direction: column;
          }
          .sidebar {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}