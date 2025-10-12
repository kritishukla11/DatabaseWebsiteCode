"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("protein");
  const [allPathways, setAllPathways] = useState<string[]>([]);
  const [allProteins, setAllProteins] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [isFocused, setIsFocused] = useState(false); // ✅ added
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // -----------------------------
  // Load data (protein + pathway lists)
  // -----------------------------
  useEffect(() => {
    const BACKEND = "http://127.0.0.1:8001";

    fetch(`${BACKEND}/proteins/list`)
      .then((r) => r.json())
      .then((d) => setAllProteins((d.proteins || []).sort()))
      .catch(() => setAllProteins([]));

    fetch(`${BACKEND}/pathways/list`)
      .then((r) => r.json())
      .then((d) => setAllPathways((d.pathways || []).sort()))
      .catch(() => setAllPathways([]));
  }, []);

  // -----------------------------
  // Handle autocomplete logic (fixed)
  // -----------------------------
  const updateSuggestions = (val: string, focused = false) => {
    setQuery(val);

    let src: string[] = [];
    if (searchType === "protein") src = allProteins;
    else if (searchType === "pathway") src = allPathways;
    else src = []; // no autocomplete for drugs

    if (!focused) {
      setSuggestions([]);
      return;
    }

    if (!val.trim()) {
      // show top 10 alphabetically when clicking into box
      setSuggestions(src.slice(0, 10));
      return;
    }

    const filtered = src
      .filter((x) => x.toLowerCase().startsWith(val.toLowerCase()))
      .slice(0, 10);
    setSuggestions(filtered);
  };

  // ✅ Re-run when backend finishes loading while focused
  useEffect(() => {
    if (isFocused) updateSuggestions(query, true);
  }, [allProteins.length, allPathways.length, isFocused]);

  // -----------------------------
  // Close autocomplete on outside click
  // -----------------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setIsFocused(false); // ✅ added
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -----------------------------
  // Handle search
  // -----------------------------
  const handleSearch = () => {
    if (!query) return;
    const normalizedQuery = query.toUpperCase();

    if (searchType === "protein") {
      router.push(`/search?gene=${encodeURIComponent(normalizedQuery)}`);
    } else if (searchType === "pathway") {
      router.push(`/pathway?pathway=${encodeURIComponent(normalizedQuery)}`);
    } else if (searchType === "drug") {
      router.push(`/drug?drug=${encodeURIComponent(normalizedQuery)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  // -----------------------------
  // Dynamic placeholder
  // -----------------------------
  const placeholderText =
    searchType === "protein"
      ? "Enter Protein Name"
      : searchType === "pathway"
      ? "Enter TRN Name"
      : "Enter Drug Name";

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <main className="main-container">
      <section className="hero">
        <h1 className="title">Welcome to STARMAP</h1>
        <p className="subtitle">
          (Oncogenic{" "}
          <span className="underline-letter">S</span>tructure –{" "}
          <span className="underline-letter">T</span>ranscriptional{" "}
          <span className="underline-letter">A</span>ctivity – drug{" "}
          <span className="underline-letter">R</span>esponse{" "}
          <span className="underline-letter">MAP</span>)
        </p>

        {/* ---------- METRICS SECTION ---------- */}
        <div className="metrics">
          <div className="metric">
            <p className="metric-label">PROTEINS</p>
            <p className="metric-value">16,000+</p>
          </div>
          <div className="divider">|</div>
          <div className="metric">
            <p className="metric-label">TRANSCRIPTIONAL REGULATORY NETWORKS</p>
            <p className="metric-value">500</p>
          </div>
          <div className="divider">|</div>
          <div className="metric">
            <p className="metric-label">DRUGS</p>
            <p className="metric-value">300</p>
          </div>
        </div>

        {/* ---------- SEARCH BAR + AUTOCOMPLETE ---------- */}
        <div className="search-row" ref={wrapperRef}>
          <select
            className="dropdown"
            value={searchType}
            onChange={(e) => {
              setSearchType(e.target.value);
              setQuery("");
              setSuggestions([]);
            }}
          >
            <option value="protein">Protein</option>
            <option value="pathway">Transcriptional Regulatory Network</option>
            <option value="drug">Drug</option>
          </select>

          <div className="search-wrapper">
            <input
              type="text"
              className="search-box"
              placeholder={placeholderText}
              value={query}
              onChange={(e) => updateSuggestions(e.target.value, true)}
              onFocus={() => {
                setIsFocused(true);
                updateSuggestions(query, true);
              }}
              onKeyDown={handleKeyDown}
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

          <button onClick={handleSearch} className="search-btn">
            Search
          </button>
        </div>

        {/* ---------- TOGGLE BUTTON ---------- */}
        <button
          className="more-info-btn"
          onClick={() => setShowInfo((prev) => !prev)}
        >
          {showInfo ? "Hide Info ▲" : "More Info ▼"}
        </button>
      </section>

      {/* ---------- COLLAPSIBLE ABOUT SECTION ---------- */}
      <section
        className="about-section"
        style={{
          maxHeight: showInfo ? `${contentRef.current?.scrollHeight}px` : "0px",
          opacity: showInfo ? 1 : 0,
          padding: showInfo ? "2rem 8rem" : "0 8rem",
        }}
      >
        <div ref={contentRef}>
          <h2>About This Platform</h2>
          <p>
            This database uses AI-based modeling to study how genetic mutations
            in cancer influence transcriptional regulation and drug response.
          </p>
        </div>
      </section>

      {/* ---------- STYLES ---------- */}
      <style jsx>{`
        .main-container {
          background: #ffffff;
          height: calc(100dvh - 70px);
          width: 100vw;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .hero {
          text-align: center;
        }
        .title {
          font-size: 2.8rem;
          font-weight: 800;
          color: #7bafd4;
        }
        .subtitle {
          color: #7bafd4;
          font-size: 1.2rem;
          margin-bottom: 2rem;
        }
        .underline-letter {
          text-decoration: underline;
          font-weight: 600;
          color: #7bafd4;
        }
        .metrics {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 2rem;
          margin-bottom: 2rem;
        }
        .metric-label {
          font-size: 0.85rem;
          color: #999;
          font-weight: 600;
        }
        .metric-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: #999;
        }
        .divider {
          color: #ddd;
          font-size: 1.4rem;
        }
        .search-row {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .search-wrapper {
          position: relative;
        }
        .dropdown,
        .search-box {
          border: 1px solid #7bafd4;
          border-radius: 6px;
          padding: 0.6rem 0.8rem;
          font-size: 1rem;
        }
        .search-box {
          width: 220px;
        }
        .search-btn {
          background-color: #7bafd4;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 0.6rem 1.2rem;
          font-weight: 600;
        }
        .suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #7bafd4;
          border-radius: 6px;
          margin: 0;
          padding: 0;
          list-style: none;
          max-height: 200px;
          overflow-y: auto;
          z-index: 1000;
        }
        .suggestions li {
          padding: 0.5rem 0.8rem;
          cursor: pointer;
        }
        .suggestions li:hover {
          background: #eaf4fb;
        }
        .more-info-btn {
          margin-top: 2rem;
          color: #7bafd4;
          border: none;
          background: none;
          font-weight: 700;
          cursor: pointer;
        }
        .about-section {
          width: 100%;
          overflow: hidden;
          transition: max-height 0.6s ease, opacity 0.4s ease;
        }
        .about-section h2 {
          text-align: center;
          color: #7bafd4;
          font-weight: 800;
        }
      `}</style>
    </main>
  );
}

