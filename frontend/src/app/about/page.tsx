"use client";

export default function AboutPage() {
  return (
    <main className="container">
      <h1 className="title">About This Database</h1>

      {/* Panel: About */}
      <div className="panel full">
        <h2 className="panel-title">Overview</h2>
        <p>
          This database was built to help researchers explore the connections between proteins,
          transcriptional regulatory networks (TRNs), and drugs in a unified framework. By integrating
          large-scale omics datasets with curated gene sets from resources like MSigDB (Molecular
          Signatures Database) and experimental interaction data from STRING, the platform enables
          users to:
        </p>
        <ul>
          <li>Search proteins, pathways, and drugs in one place.</li>
          <li>
            Explore TRNs curated from large-scale ChIP-seq studies (GTRD collection), revealing which
            transcription factors control sets of target genes.
          </li>
          <li>
            View protein–pathway associations based on quantitative scores that highlight the strength
            of evidence.
          </li>
          <li>
            Check STRING evidence for functional interactions between predicted proteins and curated
            gene set members.
          </li>
          <li>
            Discover drug sensitivities linked to specific protein–pathway contexts (future feature).
          </li>
        </ul>
      </div>

      {/* Panel: Why This Matters */}
      <div className="panel full">
        <h2 className="panel-title">Why This Matters</h2>
        <p>
          Understanding how proteins and genetic variants influence transcription factor networks is
          central to:
        </p>
        <ul>
          <li>
            <strong>Precision medicine</strong> – identifying biomarkers that guide targeted therapies.
          </li>
          <li>
            <strong>Cancer research</strong> – uncovering oncogenic pathways driving tumor biology.
          </li>
          <li>
            <strong>Drug discovery</strong> – finding new opportunities for therapeutic targeting.
          </li>
        </ul>
        <p>
          By scaling computational methods across thousands of pathways and proteins, this database
          provides a systematic way to connect molecular variation to biological function and
          therapeutic response.
        </p>
      </div>

      {/* Panel: Development */}
      <div className="panel full">
        <h2 className="panel-title">Development</h2>
        <p>
          This project was developed by Kriti Shukla and Jonnathan Castro in the <strong>Brunk Lab</strong> at UNC Chapel Hill as part of ongoing research into
          AI/ML-based approaches for mapping genetic variants to functional pathways. It combines:
        </p>
        <ul>
          <li>Machine learning pipelines for variant effect prediction.</li>
          <li>
            Integration of diverse omics datasets (structural, transcriptomic, CRISPR, proteomic).
          </li>
          <li>Curated pathway resources for standardized biological interpretation.</li>
        </ul>
      </div>

      {/* Panel: Resources */}
      <div className="panel full">
        <h2 className="panel-title">Resources</h2>
        <p>
          <strong>GitHub Repository:</strong>{" "}
          <a href="#" target="_blank" rel="noopener noreferrer">
            Link coming soon
          </a>
        </p>
        <p>
          <strong>Publication:</strong> Manuscript in preparation
        </p>
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
        ul {
          margin-top: 0.5rem;
          padding-left: 1.5rem;
          list-style-type: disc;
        }
        li {
          margin-bottom: 0.5rem;
        }
        a {
          color: #005a9c;
          text-decoration: underline;
        }
        a:hover {
          color: #003d6b;
        }
      `}</style>
    </main>
  );
}

