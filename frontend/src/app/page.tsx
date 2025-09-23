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

    if (searchType === "protein") {
      router.push(`/search?gene=${encodeURIComponent(query.trim())}`);
    } else if (searchType === "pathway") {
      router.push(`/pathway?pathway=${encodeURIComponent(query.trim())}`);
    } else if (searchType === "drug") {
      router.push(`/drug?drug=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <main className="container">
      <h1 className="title">Welcome to the Brunk Lab Protein Database!</h1>
      <form onSubmit={handleSearch} className="search-form">
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
          className="search-select"
        >
          <option value="protein">Protein</option>
          <option value="pathway">Pathway</option>
          <option value="drug">Drug</option>
        </select>
        <input
          type="text"
          placeholder={`Enter ${searchType} name`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="search-button">
          Search
        </button>
      </form>

      <style jsx>{`
        .container {
          background: white;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 2rem;
        }

        .title {
          color: #7BAFD4; /* UNC blue */
          font-size: 3.5rem;
          font-weight: 900;
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .search-form {
          display: flex;
          gap: 0.5rem;
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
          width: 250px;
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
