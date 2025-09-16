"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?gene=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <main className="container">
      <h1 className="title">Welcome to the Brunk Lab Protein Database!</h1>
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Enter protein name"
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
          font-size: 3.5rem; /* larger font */
          font-weight: 900;
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .search-form {
          display: flex;
          gap: 0.5rem;
        }

        .search-input {
          background: white;       /* force white background */
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 2px solid #7BAFD4;
          border-radius: 8px;
          width: 300px;
          outline: none;
          color: black;           /* ensure text inside is black */
        }

        .search-input:focus {
          border-color: #005A9C; /* darker UNC blue */
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

