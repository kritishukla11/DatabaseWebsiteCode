"use client";

export default function AboutPage() {
  return (
    <main className="container">
      <h1 className="title">About This Database</h1>

      {/* Panel: Overview */}
      <div className="panel full">
        <h2 className="panel-title">Overview</h2>
        <p>
          This database provides a structure-aware framework for connecting genetic
          variation in proteins to downstream transcriptional programs and
          therapeutic response.
        </p>
        <p>
          At its core is <strong>STARMAP (Structure-based Topological Analysis of Regulatory and Molecular Activity Patterns)</strong>,
          which maps variants onto protein structure, identifies spatially coherent
          functional regions, and links these regions to transcriptional regulatory
          networks (TRNs) and drug sensitivity profiles.
        </p>
        <p>
          By integrating structural data, large-scale multi-omic datasets, and
          single-cell perturbation data, the platform enables exploration of how
          local molecular perturbations propagate to global cellular behavior.
        </p>

        <p>
          <strong>Code Repository:</strong>{" "}
          <a href="#" target="_blank" rel="noopener noreferrer">
            Link coming soon
          </a>
        </p>
        <p>
          <strong>Please cite:</strong> Manuscript currently in preparation
        </p>
      </div>

      {/* Panel: How to Use */}
      <div className="panel full">
        <h2 className="panel-title">How to Use This Resource</h2>
        <p>
          This platform is organized around a set of pages and panels that connect
          proteins, transcriptional programs, and drugs.
        </p>

        <h3 className="subsection">Protein Search</h3>
        <ul>
          <li>
            3D visualization of the selected protein, colored by structural region
            (AlphaFold or PDB structures available)
          </li>
          <li>
            2D flatmaps highlighting spatial clustering of functional regions and
            enabling visualization of TRN associations
          </li>
          <li>
            Single-cell Perturb-seq validation of TRN associations
          </li>
          <li>
            Single-cell drug perturbation validation of drug associations
          </li>
          <li>
            Network view of similar proteins annotated using Gene Ontology terms
          </li>
        </ul>

        <h3 className="subsection">TRN (Transcriptional Regulatory Network) Search</h3>
        <ul>
          <li>Proteins most strongly associated with each TRN</li>
          <li>
            Comparison to known protein–protein interactions using STRING between
            proteins of interest and TRN gene set members
          </li>
        </ul>

        <h3 className="subsection">Drug Search</h3>
        <ul>
          <li>PubMed and ChEMBL information for each drug</li>
          <li>
            2D flatmaps enabling visualization of drug associations with specific
            structural regions
          </li>
        </ul>

        <h3 className="subsection">Downloads</h3>
        <ul>
          <li>Protein-level scores and cluster assignments</li>
          <li>TRN association matrices</li>
          <li>Drug association results</li>
          <li>Processed datasets used in STARMAP analyses</li>
        </ul>
      </div>

      {/* Panel: Why This Matters */}
      <div className="panel full">
        <h2 className="panel-title">Why This Matters</h2>
        <p>
          Modern biological datasets can measure thousands of molecular features
          simultaneously, but interpreting how genetic variation leads to cellular
          behavior remains a major challenge.
        </p>
        <p>
          Most large-scale approaches identify statistical associations without
          incorporating the molecular structure that governs protein function,
          limiting mechanistic interpretation.
        </p>
        <p>
          This resource addresses that gap by introducing protein structure as an
          organizing principle, enabling:
        </p>
        <ul>
          <li>Mechanistic interpretation of genetic variants</li>
          <li>Identification of functionally coherent protein regions</li>
          <li>Discovery of pathway-level biomarkers</li>
          <li>Connection of molecular variation to therapeutic response</li>
        </ul>
        <p>
          This is particularly important in cancer, where diverse mutations often
          converge onto shared regulatory programs.
        </p>
      </div>

      {/* Panel: Development */}
      <div className="panel full">
        <h2 className="panel-title">Development</h2>
        <p>
          This project was developed by Kriti Shukla in the Brunk Lab at the
          University of North Carolina at Chapel Hill.
        </p>
        <p>It integrates data from the following sources:</p>

        <h3 className="subsection">Structural Data</h3>
        <ul>
          <li>AlphaFold Protein Structure Database</li>
          <li>Protein Data Bank (PDB)</li>
        </ul>

        <h3 className="subsection">Mutation & Gene Expression Data</h3>
        <ul>
          <li>DepMap / Cancer Cell Line Encyclopedia (CCLE)</li>
        </ul>

        <h3 className="subsection">Protein Functional Annotation</h3>
        <ul>
          <li>UniProt</li>
        </ul>

        <h3 className="subsection">Protein–Protein Interaction Data</h3>
        <ul>
          <li>BioGRID</li>
          <li>Interologous Interaction Database (IID)</li>
        </ul>

        <h3 className="subsection">TRN / Gene Set Data</h3>
        <ul>
          <li>
            Gene Transcription Regulation Database (GTRD) via MSigDB TFT collection
          </li>
        </ul>

        <h3 className="subsection">Single-Cell Perturbation Data</h3>
        <ul>
          <li>X-Atlas / Orion</li>
          <li>Tahoe-100M</li>
        </ul>

        <h3 className="subsection">Drug Response Data</h3>
        <ul>
          <li>Cancer Therapeutics Research Portal (CTRP)</li>
        </ul>

        <h3 className="subsection">Variant Functional Effect Data</h3>
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
        .subsection {
          font-size: 1.2rem;
          font-weight: 600;
          margin-top: 1rem;
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