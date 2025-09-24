"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("protein"); // default = protein

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const normalized = query.trim().toUpperCase();

    if (searchType === "protein") {
      router.push(`/search?gene=${encodeURIComponent(normalized)}`);
    } else if (searchType === "pathway") {
      router.push(`/pathway?pathway=${encodeURIComponent(normalized)}`);
    } else if (searchType === "drug") {
      router.push(`/drug?drug=${encodeURIComponent(normalized)}`);
    }
  };

  const getPlaceholder = () => {
    if (searchType === "pathway") return "Enter transcription factor network name";
    return `Enter ${searchType} name`;
  };

  return (
    <main className="container">
      <div className="content">
        <h1 className="title">Welcome to the Brunk Lab Protein Database!</h1>
        <form onSubmit={handleSearch} className="search-form">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="search-select"
          >
            <option value="protein">Protein</option>
            <option value="pathway">Transcription Factor Network</option>
            <option value="drug">Drug</option>
          </select>
          <input
            type="text"
            placeholder={getPlaceholder()}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="search-button">
            Search
          </button>
        </form>
      </div>

      <style jsx>{`
        .container {
          background: white;
          min-height: 100vh; /* full browser height */
          display: flex;
          justify-content: center; /* center vertically */
          align-items: center; /* center horizontally */
        }

        .content {
          text-align: center;
        }

        .title {
          color: #7BAFD4; /* UNC blue */
          font-size: 3.5rem;
          font-weight: 900;
          margin-bottom: 2.5rem;
        }

        .search-form {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
        }

        .search-select {
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 2px solid #7BAFD4;
          border-radius: 8px;
          background: white;
          color: black;
          cursor: pointer;
        }

        .search-input {
          background: white;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 2px solid #7BAFD4;
          border-radius: 8px;
          width: 400px; /* ✅ wider search bar */
          outline: none;
          color: black;
        }

        .search-input:focus {
          border-color: #005A9C;
        }

        .search-button {
          background: #7BAFD4;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .search-button:hover {
          background: #005A9C;
        }
      `}</style>
    </main>
  );
}


