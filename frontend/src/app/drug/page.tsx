"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function DrugPage() {
  const searchParams = useSearchParams();
  const drug = searchParams.get("drug") || "";

  // Placeholder panel data
  const [panel1Data, setPanel1Data] = useState<any[]>([]);
  const [panel2Data, setPanel2Data] = useState<any[]>([]);
  const [panel3Data, setPanel3Data] = useState<any[]>([]);
  const [panel4Data, setPanel4Data] = useState<any[]>([]);

  useEffect(() => {
    if (!drug) return;
    // fetch your data here later
  }, [drug]);

  return (
    <main className="container">
      <h1 className="title">Results for: {drug} drug</h1>

      {/* Row 1 */}
      <div className="panel-row">
        <div className="panel half">
          <h2 className="panel-title">Drug Info</h2>
          {panel1Data.length ? (
            <pre>{JSON.stringify(panel1Data, null, 2)}</pre>
          ) : (
            <p>No data yet.</p>
          )}
        </div>

        <div className="panel half">
          <h2 className="panel-title">Panel 2: Associated Pathways</h2>
          {panel2Data.length ? (
            <pre>{JSON.stringify(panel2Data, null, 2)}</pre>
          ) : (
            <p>No data yet.</p>
          )}
        </div>
      </div>

      {/* Row 2 */}
      <div className="panel-row">
        <div className="panel half">
          <h2 className="panel-title">Panel 3: Predicted Gene Effects</h2>
          {panel3Data.length ? (
            <pre>{JSON.stringify(panel3Data, null, 2)}</pre>
          ) : (
            <p>No data yet.</p>
          )}
        </div>

        <div className="panel half">
          <h2 className="panel-title">Panel 4: Literature or Clinical Associations</h2>
          {panel4Data.length ? (
            <pre>{JSON.stringify(panel4Data, null, 2)}</pre>
          ) : (
            <p>No data yet.</p>
          )}
        </div>
      </div>

      <style jsx>{`
        .container {
          background: #ffffff;
          min-height: 100vh;
          width: 100%;
          margin: 0;
          padding: 12px;
          box-sizing: border-box;
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
        @media (max-width: 900px) {
          .panel-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

