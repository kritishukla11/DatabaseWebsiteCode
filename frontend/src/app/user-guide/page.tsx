"use client";

export default function UserGuidePage() {
  return (
    <main className="container">
      <h1 className="title">User Guide</h1>

      {/* Panel: Searching the Database */}
      <div className="panel full">
        <h2 className="panel-title">Searching the Database</h2>
        <p>
          You can search the database by <strong>protein</strong>,{" "}
          <strong>transcriptional regulatory network (TRN)</strong>, or{" "}
          <strong>drug</strong> using the search bar on the homepage.  
        </p>
        <ul>
          <li>
            <strong>Protein search:</strong> Returns information about the
            selected protein, including its associations with transcriptional
            networks and drug sensitivity data (when available).
          </li>
          <li>
            <strong>Transcriptional Regulatory Network search:</strong> Returns
            proteins predicted to associate with the selected TRN above a chosen
            threshold, STRING evidence for protein–gene set interactions, and
            a gene set description from MSigDB.
          </li>
          <li>
            <strong>Drug search:</strong> Placeholder feature – coming soon.
          </li>
        </ul>
        <p>
          All searches are <strong>case-insensitive</strong>. For example,{" "}
          <code>ada2</code>, <code>Ada2</code>, and <code>ADA2</code> will all
          return results for <code>ADA2</code>.
        </p>
      </div>

      {/* Panel: Pathway/Network Results */}
      <div className="panel full">
        <h2 className="panel-title">Pathway / Network Results</h2>
        <p>
          When searching for a transcriptional regulatory network (TRN), the
          results page contains several panels:
        </p>
        <ul>
          <li>
            <strong>Gene Set Description:</strong> A brief description of how the
            TRN was defined, including transcription factor binding evidence and
            supporting publications (PubMed links and author lists provided where
            available).
          </li>
          <li>
            <strong>Proteins Panel:</strong> Displays all proteins associated
            with the selected TRN above a chosen score threshold. You can adjust
            the minimum threshold using the dropdown menu.
          </li>
          <li>
            <strong>STRING Evidence Panel:</strong> Shows functional interactions
            between predicted proteins and curated gene set members as reported
            by the STRING database.
          </li>
          <li>
            <strong>Expandable Explanation:</strong> Provides background
            information on MSigDB and how transcriptional regulatory networks are
            curated from ChIP-seq experiments.
          </li>
        </ul>
      </div>

      {/* Panel: Error Handling */}
      <div className="panel full">
        <h2 className="panel-title">Error Messages</h2>
        <p>
          If a query does not match any entry in the database, you will see the
          message:
        </p>
        <p className="error">
          "Sorry, we don't have information for this transcription regulatory
          network"
        </p>
        <p>
          This means the TRN or protein you searched for is not currently
          included in the dataset.
        </p>
      </div>

      {/* Panel: Future Features */}
      <div className="panel full">
        <h2 className="panel-title">Future Features</h2>
        <p>
          We are actively expanding the database to include:
        </p>
        <ul>
          <li>
            Drug–TRN and drug–protein connections, enabling searches for compounds
            that modulate transcriptional regulatory networks.
          </li>
          <li>
            Interactive network visualizations for proteins, pathways, and drugs.
          </li>
          <li>
            Expanded variant annotations across additional cancer types and
            biological contexts.
          </li>
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
        ul {
          margin-top: 0.5rem;
          padding-left: 1.5rem;
          list-style-type: disc;
        }
        li {
          margin-bottom: 0.5rem;
        }
        .error {
          color: red;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
