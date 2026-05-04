"use client";

export default function AboutPage() {
  return (
    <main className="container">
      <h1 className="title">About</h1>

      {/* Panel: Code & Citation (moved to top) */}
      <div className="panel">
        <h2 className="panel-title">Attribution</h2>
        <p>
          <strong>Code Repository:</strong> https://github.com/Brunk-Lab/STARMAP for the software package, https://github.com/Brunk-Lab/STARMAP_paper for the accompanying paper
        </p>
        <p>
          <strong>Please cite:</strong> Manuscript currently in preparation
        </p>
      </div>

      {/* Panel: Overview */}
      <div className="panel">
        <h2 className="panel-title">STARMAP Overview</h2>
        <p>
          This database provides a structure-aware framework for connecting
          genetic variation in proteins to downstream transcriptional programs
          and therapeutic response.
        </p>
        <p>
          At its core is STARMAP (Structure-based Topological Analysis of
          Regulatory and Molecular Activity Patterns), which maps variants onto
          protein structure, identifies spatially coherent functional regions,
          and links these regions to transcriptional regulatory networks (TRNs)
          and drug sensitivity profiles.
        </p>
        <p>
          By integrating structural data, large-scale multi-omic datasets, and
          single-cell perturbation data, the platform enables exploration of how
          local molecular perturbations propagate to global cellular behavior.
        </p>
      </div>

      {/* Panel: Attribution */}
      <div className="panel">
        <p>
          This project was developed by Kriti Shukla in the
          Brunk Lab at the University of North Carolina at Chapel Hill.
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
      `}</style>
    </main>
  );
}