"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("protein");

  const [allPathways, setAllPathways] = useState<string[]>([]);
  const [allProteins, setAllProteins] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (searchType === "pathway") {
      fetch("http://127.0.0.1:8001/pathways/list")
        .then((res) => res.json())
        .then((data) => setAllPathways(data.pathways || []))
        .catch(() => setAllPathways([]));
    } else if (searchType === "protein") {
      fetch("http://127.0.0.1:8001/proteins/list")
        .then((res) => res.json())
        .then((data) => setAllProteins(data.proteins || []))
        .catch(() => setAllProteins([]));
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
      normalized = normalized.toUpperCase();
      router.push(`/pathway?pathway=${encodeURIComponent(normalized)}`);
    } else if (searchType === "drug") {
      router.push(`/drug?drug=${encodeURIComponent(normalized)}`);
    }
  };

  const getPlaceholder = () => {
    if (searchType === "pathway") return "Enter transcriptional regulatory network name";
    if (searchType === "protein") return "Enter protein name";
    return `Enter ${searchType} name`;
  };

  const handleInputChange = (val: string) => {
    setQuery(val);

    if (searchType === "pathway") {
      const lowerVal = val.toLowerCase();
      setSuggestions(
        allPathways.filter((p) => p.toLowerCase().startsWith(lowerVal))
      );
    } else if (searchType === "protein") {
      const upperVal = val.toUpperCase();
      setSuggestions(
        allProteins.filter((p) => p.startsWith(upperVal))
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
            {suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((s) => (
                  <li
                    key={s}
                    onClick={() => {
                      setQuery(s);
                      setSuggestions([]);
                    }}
                  >
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

        {/* --- About Section --- */}
        <div className="about-section">
          <h2>About This Platform</h2>
          <p>
            This database uses AI-based modeling to study how genetic mutations in cancer
            influence transcriptional regulation and drug response. We generate 2D
            functional flatmaps for over <strong>16,000 human proteins</strong>, identifying{" "}
            <strong>Regions of Functional Interest (RFIs)</strong> that contain clustered
            mutations from <strong>The Cancer Dependency Map (DepMap)</strong>. Our
            multi-omics pipeline connects these RFIs to changes in{" "}
            <strong>Transcriptional Regulatory Networks (TRNs)</strong> across{" "}
            <strong>500 transcription factors</strong> and predicts{" "}
            <strong>drug sensitivity profiles</strong> for more than{" "}
            <strong>300 compounds</strong> from <strong>CTRP</strong> and{" "}
            <strong>PRISM</strong>. These computational predictions are supported by
            large-scale <strong>single-cell Perturb-seq</strong> experiments that validate
            variant-driven transcriptional and drug-response effects. Together, these
            analyses provide an integrated view of how protein-level variation shapes gene
            regulation and therapeutic sensitivity in cancer.
          </p>
          <p>
            You can explore these associations by searching for a{" "}
            <strong>protein</strong>, a{" "}
            <strong>Transcriptional Regulatory Network (TRN)</strong>, or a{" "}
            <strong>drug</strong>. Each view provides complementary insights that connect
            structural variation to regulatory activity and therapeutic response.
          </p>
        </div>
      </div>

      <style jsx>{`
        .container {
          background: white;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 3rem 1rem;
        }

        .content {
          text-align: center;
          max-width: 850px;
        }

        .title {
          color: #7bafd4;
          font-size: 3.5rem;
          font-weight: 900;
          margin-bottom: 2.5rem;
        }

        .search-form {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          position: relative;
          margin-bottom: 3rem;
        }

        .search-select {
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 2px solid #7bafd4;
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
          border: 2px solid #7bafd4;
          border-radius: 8px;
          width: 400px;
          outline: none;
          color: black;
        }

        .search-input:focus {
          border-color: #005a9c;
        }

        .suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          border: 1px solid #7bafd4;
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
          background: #7bafd4;
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
          background: #005a9c;
        }

        .about-section {
          text-align: left;
          margin-top: 3rem;
          color: #222;
          line-height: 1.6;
          font-size: 1.05rem;
        }

        .about-section h2 {
          color: #7bafd4;
          font-size: 1.8rem;
          font-weight: 700;
          margin-bottom: 1rem;
          text-align: center;
        }

        .about-section p {
          margin-bottom: 1.2rem;
        }
      `}</style>
    </main>
  );
}
