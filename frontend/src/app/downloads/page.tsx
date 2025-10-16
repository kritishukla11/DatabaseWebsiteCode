"use client";

import { useEffect, useState } from "react";

type Downloadable = {
  filename: string;
  description: string;
};

export default function DownloadsPage() {
  const [files, setFiles] = useState<Downloadable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8001/downloads/list")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data);
      })
      .catch(() => setError("Failed to fetch downloads list."));
  }, []);

  return (
    <main className="container">
      <h1 className="title">Downloads</h1>

      {error && <p className="error">{error}</p>}

      {!error && (
        <table className="downloads-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, idx) => (
              <tr key={idx}>
                <td>{f.filename}</td>
                <td>{f.description}</td>
                <td>
                  <a
                    href={`http://127.0.0.1:8001/downloads/get/${encodeURIComponent(
                      f.filename
                    )}`}
                    className="download-btn"
                  >
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .container {
          background: #ffffff;
          min-height: 100vh;
          padding: 24px;
        }
        .title {
          color: #7bafd4;
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 2rem;
        }
        .downloads-table {
          width: 100%;
          border-collapse: collapse;
        }
        .downloads-table th,
        .downloads-table td {
          border: 1px solid #ccc;
          padding: 0.75rem;
          text-align: left;
        }
        .downloads-table th {
          background: #f1f9ff;
          color: #333;
          font-weight: 700;
        }
        .downloads-table tr:nth-child(even) {
          background: #fafafa;
        }
        .download-btn {
          display: inline-block;
          padding: 0.4rem 0.8rem;
          background: #7bafd4;
          color: white;
          border-radius: 6px;
          text-decoration: none;
          font-size: 0.9rem;
          transition: background 0.2s ease-in-out;
        }
        .download-btn:hover {
          background: #5a91b5;
        }
        .error {
          color: red;
          font-size: 1.2rem;
          text-align: center;
          margin: 2rem 0;
        }
      `}</style>
    </main>
  );
}
