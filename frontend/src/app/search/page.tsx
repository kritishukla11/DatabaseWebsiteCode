"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Panel2Flatmap from "@/components/Panel2Flatmap";
import Panel3Calibration from "@/components/Panel3Calibration";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function SearchPage() {
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

  // Effect 1: listen for resize messages from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "resize-panel") {
        if (event.data.panel === "panel1") {
          setIframeHeights((prev) => ({
            ...prev,
            [event.data.panel]: event.data.height || 600,
          }));
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Effect 2: fetch group label
  useEffect(() => {
    if (!gene) return;
    fetch(`http://127.0.0.1:8001/group_label?gene=${encodeURIComponent(gene)}`)
      .then((res) => res.json())
      .then((data) => setGroupLabel(data.group_label || null))
      .catch(() => setGroupLabel(null));
  }, [gene]);

  // Effect 3: fetch network plot + neighbors
  useEffect(() => {
    if (!gene) return;
    fetch(`http://127.0.0.1:8001/plot?gene=${encodeURIComponent(gene)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Fetch failed");
        return res.json();
      })
      .then((data) => {
        setPlotJson(data.plot);
        const sorted = (data.neighbors || []).sort(
          (a: any, b: any) => (b.cosine_sim ?? 0) - (a.cosine_sim ?? 0)
        );
        setNeighbors(sorted);
        setSelectedGene("");
        setSharedGroups([]);
        setExpandedGroup(null);
        setError(null);
      })
      .catch((e) => {
        console.error(e);
        setError("No data available for this gene.");
        setPlotJson(null);
        setNeighbors([]);
        setSelectedGene("");
        setSharedGroups([]);
        setExpandedGroup(null);
      });
  }, [gene]);

  // Effect 4: fetch shared pathway groups when neighbor selected
  useEffect(() => {
    if (!gene || !selectedGene) {
      setSharedGroups([]);
      setExpandedGroup(null);
      return;
    }
    fetch(
      `http://127.0.0.1:8001/shared_pathway_groups?query=${encodeURIComponent(
        gene
      )}&neighbor=${encodeURIComponent(selectedGene)}`
    )
      .then((res) => res.json())
      .then((data) => setSharedGroups(data.groups || []))
      .catch(() => setSharedGroups([]));
  }, [gene, selectedGene]);

  return (
    <main className="container">
      <h1 className="title">Results for: {gene}</h1>
      <div className="back-home">
        <a href="/" className="home-link">
          ← Back to Home
        </a>
      </div>

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

        <div className="panel half">
          <h2 className="panel-title">2D Protein Flatmap</h2>
          <Panel2Flatmap gene={gene} />
        </div>
      </div>

      {/* Row 2: Panel 3 + Panel 4 */}
      <div className="panel-row">
        <div
          className="panel half"
          style={{ minHeight: "600px", display: "flex", flexDirection: "column" }}
        >
          <h2 className="panel-title">Empirical Calibration Plot - Protein/Pathway</h2>
          <Panel3Calibration gene={gene} />
        </div>

        <div className="panel half">
          <h2 className="panel-title">Panel 4</h2>
          <p>Content for Panel 4 will go here later...</p>
        </div>
      </div>

      {/* Panel 5 full-width */}
      <div className="panel full panel5">
        <h2 className="panel-title">Pathway Network</h2>
        {groupLabel && (
          <p className="group-label">Group Annotation: {groupLabel}</p>
        )}
        <div className="network-container">
          <div className="plot-area">
            {error ? (
              <p className="error">{error}</p>
            ) : plotJson ? (
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
            <h3 className="sidebar-title">Shared Pathways</h3>

            {/* Neighbor dropdown */}
            <select
              className="dropdown"
              value={selectedGene}
              onChange={(e) => setSelectedGene(e.target.value)}
              aria-label="Select neighbor gene"
            >
              <option value="">Select gene</option>
              {neighbors.map((n) => (
                <option key={n.protein_id} value={n.protein_id}>
                  {n.protein_id}
                </option>
              ))}
            </select>

            {/* Functional group buttons */}
            <div className="pathway-box">
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
                            {g.pathway_id.map((pw: string, j: number) => (
                              <li key={j}>{pw}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-pathways">No shared pathways found.</p>
                )
              ) : (
                <p className="no-pathways">Select a neighbor gene</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .container {
          background: #f5f6fa;
          min-height: 100vh;
          width: 100%;
          margin: 0;
          padding: 12px;
          box-sizing: border-box;
        }
        body {
          background: #f5f6fa;
        }
        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 1rem;
        }
        .back-home {
          text-align: center;
          margin-bottom: 2rem;
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
        .panel.half {
          width: 100%;
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
          overflow: visible;
        }
        .plot-area {
          flex: 1;
          min-width: 0;
          overflow: visible;
          background: white;
          border-radius: 8px;
        }
        .sidebar {
          width: 300px;
          background: #f1f9ff;
          border: 1px solid #7bafd4;
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
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
        .pathway-box {
          flex: 1;
          overflow-y: auto;
          max-height: 560px;
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
          list-style: disc;
          color: black;
        }
        .no-pathways {
          color: black;
        }
        .error {
          color: red;
          text-align: center;
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
            max-height: 320px;
          }
          .pathway-box {
            max-height: 240px;
          }
          #panel1-iframe {
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}

