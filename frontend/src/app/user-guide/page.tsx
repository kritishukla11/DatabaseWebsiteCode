"use client";

export default function UserGuidePage() {
  return (
    <main className="container">
      <h1 className="title">User Guide</h1>

      {/* Attribution */}
      <div className="panel">
        <h2 className="panel-title">Attribution</h2>
        <p><strong>Code Repository:</strong> Link coming soon</p>
        <p><strong>Please cite:</strong> Manuscript currently in preparation</p>
      </div>

      {/* Getting Started */}
      <div className="panel">
        <h2 className="panel-title">Getting Started</h2>
        <p>
          The platform is organized around proteins, transcriptional regulatory
          networks (TRNs), and drugs.
        </p>
        <ul>
          <li>
            Search for a <strong>protein</strong> to explore its structural
            organization and associated transcriptional and drug response
            patterns.
          </li>
          <li>
            Search for a <strong>TRN</strong> to identify proteins associated
            with that transcriptional program.
          </li>
          <li>
            Search for a <strong>drug</strong> to learn more about its structure
            and the protein regions it associates with.
          </li>
        </ul>
      </div>

      {/* Searching */}
      <div className="panel">
        <h2 className="panel-title">Searching the Database</h2>
        <p>
          You can search the database by protein, transcriptional regulatory
          network (TRN), or drug using the search bar on the homepage. All
          searches are case-insensitive.
        </p>

        <h3 className="subheading">Protein Search</h3>
        <ul>
          <li>3D protein structure view (AlphaFold or PDB), colored by structural region</li>
          <li>2D flatmaps highlighting spatial clustering of functional regions</li>
          <li>Visualization of TRN associations mapped onto structure</li>
          <li>Single-cell Perturb-seq validation of TRN associations</li>
          <li>Single-cell drug perturbation validation of drug associations</li>
          <li>Network view of similar proteins annotated with Gene Ontology terms</li>
        </ul>

        <h3 className="subheading">TRN (Transcriptional Regulatory Network) Search</h3>
        <ul>
          <li>Proteins most strongly associated with the selected TRN</li>
          <li>
            Comparison to known STRING interactions between predicted proteins
            and TRN gene set members
          </li>
        </ul>

        <h3 className="subheading">Drug Search</h3>
        <ul>
          <li>PubMed and ChEMBL information for each drug</li>
          <li>
            2D flatmaps of proteins showing drug associations with specific
            structural regions
          </li>
        </ul>
      </div>

      {/* Downloads */}
      <div className="panel">
        <h2 className="panel-title">Downloads</h2>
        <p>
          Use this section to access underlying data for external analysis.
        </p>
        <ul>
          <li>Protein-level scores and cluster assignments</li>
          <li>TRN association matrices</li>
          <li>Drug association results</li>
          <li>Processed datasets used in STARMAP analyses</li>
        </ul>
      </div>

      {/* Interpreting */}
      <div className="panel">
        <h2 className="panel-title">Interpreting Results</h2>
        <p>
          Structural regions represent spatially coherent areas of the protein
          associated with shared transcriptional or pharmacologic effects.
        </p>
        <p>
          TRN and drug associations reflect statistically enriched patterns and
          should be interpreted as hypotheses for functional mechanisms rather
          than direct causal relationships.
        </p>
      </div>

      {/* Errors */}
      <div className="panel">
        <h2 className="panel-title">Error Messages</h2>
        <p>
          If a query does not match any entry in the database, you will see:
        </p>
        <p className="error">
          "Sorry, we don't have information for [...]"
        </p>
      </div>

      {/* Data Sources */}
      <div className="panel">
        <h2 className="panel-title">Data Sources</h2>
        <p>STARMAP combines data from the following sources:</p>

        <h3 className="subheading">Structural Data</h3>
        <ul>
          <li>AlphaFold Protein Structure Database</li>
          <li>Protein Data Bank (PDB)</li>
        </ul>

        <h3 className="subheading">Mutation & Gene Expression Data</h3>
        <ul>
          <li>DepMap / Cancer Cell Line Encyclopedia (CCLE)</li>
        </ul>

        <h3 className="subheading">Protein Functional Annotation</h3>
        <ul>
          <li>UniProt</li>
        </ul>

        <h3 className="subheading">Protein–Protein Interaction Data</h3>
        <ul>
          <li>BioGRID</li>
          <li>Interologous Interaction Database (IID)</li>
        </ul>

        <h3 className="subheading">TRN / Gene Set Data</h3>
        <ul>
          <li>Gene Transcription Regulation Database (GTRD) via MSigDB TFT collection</li>
        </ul>

        <h3 className="subheading">Single-Cell Perturbation Data</h3>
        <ul>
          <li>X-Atlas / Orion</li>
          <li>Tahoe-100M</li>
        </ul>

        <h3 className="subheading">Drug Response Data</h3>
        <ul>
          <li>Cancer Therapeutics Research Portal (CTRP)</li>
        </ul>

        <h3 className="subheading">Variant Functional Effect Data</h3>
        <ul>
          <li>MaveDB</li>
        </ul>
      </div>

      <style jsx>{`
        .container {
          background: #ffffff;
          min-height: 100vh;
          padding: 20px;
        }
        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 2rem;
        }
        .panel {
          background: white;
          border: 2px solid #7bafd4;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .panel-title {
          color: #7bafd4;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }
        .subheading {
          font-size: 1.1rem;
          font-weight: 700;
          margin-top: 1rem;
        }
        ul {
          padding-left: 1.5rem;
        }
        li {
          margin-bottom: 0.4rem;
        }
        .error {
          color: red;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
