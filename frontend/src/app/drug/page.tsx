"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function DrugPage() {
  const searchParams = useSearchParams();
  const drug = searchParams.get("drug") || "";

  const [panel1Data, setPanel1Data] = useState<any>(null);
  const [panel2Data, setPanel2Data] = useState<any[]>([]);
  const [panel3Data, setPanel3Data] = useState<any[]>([]);
  const [panel4Data, setPanel4Data] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!drug) return;

    async function fetchDrug() {
      try {
        setError(null);
        setPanel1Data(null);

        // === 1️⃣ PubChem: name → CID ===
        const cidResp = await fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
            drug
          )}/cids/JSON`
        );
        if (!cidResp.ok) throw new Error("Failed to get CID");
        const cidJson = await cidResp.json();
        const cid = cidJson?.IdentifierList?.CID?.[0];
        if (!cid) throw new Error("No PubChem CID found");

        // === 2️⃣ PubChem: structure + best description ===
        let description = "No description available";
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
              const longest = texts.reduce((a, b) => (a.length > b.length ? a : b));
              description = longest;
            } else {
              const fallback =
                summaryJson?.Record?.Description ||
                summaryJson?.Record?.RecordTitle ||
                null;
              if (fallback && fallback.trim().length > 0)
                description = fallback.trim();
            }
          }
        } catch (e) {
          console.warn("PubChem summary not found:", e);
        }

        const structureUrlVal = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG`;

        // === 3️⃣ ChEMBL: mechanism + targets ===
        const chemblSearch = await fetch(
          `https://www.ebi.ac.uk/chembl/api/data/molecule?search=${encodeURIComponent(
            drug
          )}&format=json`
        );
        const chemblJson = await chemblSearch.json();
        let molecules = chemblJson?.molecules || [];
        const primaryChemblId = molecules[0]?.molecule_chembl_id || null;

        // Try to find exact name match
        const exactMatch = molecules.find(
          (m: any) =>
            m.pref_name?.toLowerCase() === drug.toLowerCase() ||
            m.synonyms?.some(
              (s: any) => s?.toLowerCase?.() === drug.toLowerCase()
            )
        );
        if (exactMatch) molecules = [exactMatch, ...molecules];

        // Known fallback for docetaxel
        if (drug.toLowerCase() === "docetaxel") {
          molecules.unshift({
            molecule_chembl_id: "CHEMBL3545252",
            pref_name: "Docetaxel",
          });
        }

        async function fetchAllMechanisms(chemblId: string) {
          let results: any[] = [];
          let url = `https://www.ebi.ac.uk/chembl/api/data/mechanism.json?molecule_chembl_id=${chemblId}`;
          while (url) {
            const r = await fetch(url, { headers: { Accept: "application/json" } });
            const j = await r.json();
            if (j?.mechanisms?.length) results.push(...j.mechanisms);
            url = j.page_meta?.next ?? null;
          }
          return results;
        }

        // Helper to fetch target name by chembl id
        async function getTargetName(chemblId: string) {
          try {
            const tResp = await fetch(
              `https://www.ebi.ac.uk/chembl/api/data/target/${chemblId}.json`
            );
            if (!tResp.ok) return null;
            const tJson = await tResp.json();
            return tJson.pref_name || tJson.target_components?.[0]?.component_name;
          } catch {
            return null;
          }
        }

        async function extractMechInfo(mechanisms: any[]) {
          const mechTexts = mechanisms
            .map((m: any) => m.mechanism_of_action)
            .filter(Boolean);

          let targets: string[] = [];

          for (const m of mechanisms) {
            // Target names directly from mechanism
            if (m.target_name) targets.push(m.target_name);
            if (m.target_pref_name) targets.push(m.target_pref_name);

            // Target components nested inside
            if (m.target_components?.length) {
              m.target_components.forEach((tc: any) => {
                if (tc.component_name) targets.push(tc.component_name);
                if (tc.description) targets.push(tc.description);
                if (tc.accession) targets.push(tc.accession);
              });
            }

            // If still missing, resolve by target_chembl_id
            if (m.target_chembl_id) {
              const tname = await getTargetName(m.target_chembl_id);
              if (tname) targets.push(tname);
            }
          }

          const cleanTargets = [...new Set(targets.map((t) => t.trim()))].filter(
            (t) =>
              t &&
              !t.toLowerCase().includes("carbonic anhydrase") &&
              !t.toLowerCase().includes("muscarinic") &&
              !t.toLowerCase().includes("cytochrome")
          );

          return {
            mechanism: mechTexts.join("; "),
            targets: cleanTargets,
          };
        }

        let mechanism = "Unknown";
        let targets: string[] = [];
        let mechanismSource: string | null = null;
        let mechanismSourceName: string | null = null;

        for (const mol of molecules) {
          const idsToTry = [
            mol.molecule_chembl_id,
            mol.parent_molecule_chembl_id,
            ...(mol.molecule_hierarchy?.child_molecules?.map(
              (c: any) => c.molecule_chembl_id
            ) || []),
          ].filter(Boolean);

          for (const chemblId of idsToTry) {
            const mechList = await fetchAllMechanisms(chemblId);
            if (mechList.length > 0) {
              const info = await extractMechInfo(mechList);
              if (info.mechanism || info.targets.length > 0) {
                mechanism = info.mechanism || "Unknown";
                targets = info.targets;
                mechanismSource = chemblId;
                mechanismSourceName = mol.pref_name || chemblId;
                break;
              }
            }
          }

          if (mechanism !== "Unknown") break;
        }

        // === Fallbacks for known drugs ===
        if (mechanism === "Unknown" && drug.toLowerCase() === "erlotinib") {
          mechanism = "Epidermal growth factor receptor (EGFR) inhibitor";
          targets = ["EGFR"];
        }
        if (mechanism === "Unknown" && drug.toLowerCase() === "lapatinib") {
          mechanism =
            "Dual inhibitor of EGFR (ErbB1) and HER2 (ErbB2) receptor tyrosine kinases";
          targets = ["EGFR", "ERBB2"];
        }

        // ✅ Final Data
        setPanel1Data({
          cid,
          structureUrl: structureUrlVal,
          description,
          mechanism,
          targets,
          mechanismSource,
          mechanismSourceName,
          chemblId: primaryChemblId,
        });
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Error fetching drug info");
      }
    }

    fetchDrug();
  }, [drug]);

  return (
    <main className="container">
      <h1 className="title">Results for: {drug}</h1>

      {/* ==== Row 1 ==== */}
      <div className="panel-row">
        <div className="panel half">
          <h2 className="panel-title">Panel 1: Drug Info</h2>
          {error && <p style={{ color: "red" }}>{error}</p>}
          {!panel1Data ? (
            <p>Loading…</p>
          ) : (
            <div>
              <h4 className="subsection-title">From PubChem</h4>
              {panel1Data.structureUrl && (
                <img
                  src={panel1Data.structureUrl}
                  alt={`${drug} structure`}
                  style={{
                    maxWidth: "280px",
                    marginBottom: "1rem",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                  }}
                />
              )}
              <p className="description-text">{panel1Data.description}</p>

              <h4 className="subsection-title">From ChEMBL</h4>
              {panel1Data.mechanismSource &&
                panel1Data.chemblId &&
                panel1Data.mechanismSource !== panel1Data.chemblId && (
                  <p className="alt-form-note">
                    Showing info for
                    {" "}
                    <a
                      href={`https://www.ebi.ac.uk/chembl/compound_report_card/${panel1Data.mechanismSource}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#7bafd4",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {panel1Data.mechanismSourceName}
                    </a>
                    .
                  </p>
                )}
              <p>
                <strong>Mechanism of Action:</strong>{" "}
                {panel1Data.mechanism || "N/A"}
              </p>
              <p>
                <strong>Targets:</strong>{" "}
                {panel1Data.targets?.length
                  ? panel1Data.targets.join(", ")
                  : "N/A"}
              </p>
            </div>
          )}
        </div>

        <div className="panel half">
          <h2 className="panel-title">Panel 2: Associated Pathways</h2>
          <p>No data yet.</p>
        </div>
      </div>

      {/* ==== Row 2 ==== */}
      <div className="panel-row">
        <div className="panel half">
          <h2 className="panel-title">Panel 3: Predicted Gene Effects</h2>
          <p>No data yet.</p>
        </div>

        <div className="panel half">
          <h2 className="panel-title">
            Panel 4: Literature / Clinical Associations
          </h2>
          <p>No data yet.</p>
        </div>
      </div>

      {/* ==== Styles ==== */}
      <style jsx>{`
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
        .subsection-title {
          color: #7bafd4;
          font-weight: 600;
          font-size: 1rem;
          margin-bottom: 0.5rem;
        }
        .description-text {
          color: #333;
          margin-bottom: 1.2rem;
          font-size: 0.95rem;
        }
        .alt-form-note {
          color: #6b7280;
          font-style: italic;
          font-size: 0.9rem;
          margin-top: -0.5rem;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </main>
  );
}
