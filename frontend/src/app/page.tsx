"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("protein"); // default = protein

  // state for autocomplete
  const [allPathways, setAllPathways] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // load pathway list only if pathway search is selected
  useEffect(() => {
    if (searchType === "pathway") {
      fetch("http://127.0.0.1:8001/pathways/list")
        .then((res) => res.json())
        .then((data) => setAllPathways(data.pathways || []))
        .catch(() => setAllPathways([]));
    }
  }, [searchType]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    let normalized = query.trim();

    if (searchType === "protein") {
      normalized = normalized.toUpperCase();
      router.push(`/search?gene=${encodeURIComponent(normalized)}`);
    } else if (searchType === "pathway") {
      normalized = normalized.toUpperCase(); // ✅ force uppercase
      router.push(`/pathway?pathway=${encodeURIComponent(normalized)}`);
    } else if (searchType === "drug") {
      router.push(`/drug?drug=${encodeURIComponent(normalized)}`);
    }
  };

  const getPlaceholder = () => {
    if (searchType === "pathway") return "Enter transcriptional regulatory network name";
    return `Enter ${searchType} name`;
  };

  const handleInputChange = (val: string) => {
    setQuery(val);

    if (searchType === "pathway") {
      const lowerVal = val.toLowerCase();
      setSuggestions(
        allPathways.filter((p) => p.toLowerCase().startsWith(lowerVal))
      );
    } else {
      setSuggestions([]);
    }
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
            <option value="pathway">Transcriptional Regulatory Network</option>
            <option value="drug">Drug</option>
          </select>

          <div className="input-wrapper">
            <input
              type="text"
              placeholder={getPlaceholder()}
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              className="search-input"
            />
            {searchType === "pathway" && suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((s) => (
                  <li key={s} onClick={() => { setQuery(s); setSuggestions([]); }}>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="submit" className="search-button">
            Search
          </button>
        </form>
      </div>

      <style jsx>{`
        .container {
          background: white;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .content {
          text-align: center;
        }

        .title {
          color: #7BAFD4;
          font-size: 3.5rem;
          font-weight: 900;
          margin-bottom: 2.5rem;
        }

        .search-form {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          position: relative;
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

        .input-wrapper {
          position: relative;
        }

        .search-input {
          background: white;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 2px solid #7BAFD4;
          border-radius: 8px;
          width: 400px;
          outline: none;
          color: black;
        }

        .search-input:focus {
          border-color: #005A9C;
        }

        .suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          border: 1px solid #7BAFD4;
          border-radius: 4px;
          margin-top: 0.25rem;
          max-height: 200px;
          overflow-y: auto;
          background: white;
          z-index: 1000;
          text-align: left;
        }

        .suggestions li {
          padding: 0.5rem;
          cursor: pointer;
        }

        .suggestions li:hover {
          background: #f1f9ff;
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


