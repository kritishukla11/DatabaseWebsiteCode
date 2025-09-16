"use client";

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel2Flatmap({ gene }: { gene: string }) {
  const [pathways, setPathways] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  // Load available pathways when gene changes
  useEffect(() => {
    if (!gene) return;
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/flatmap/pathways?gene=${gene}`);
        const data = await res.json();
        setPathways(data.pathways || []);
      } catch (err) {
        console.error("Error fetching pathways", err);
      }
    })();
  }, [gene]);

  // Image URL
  const imgUrl = selected
    ? `${BACKEND}/flatmap/image?gene=${gene}&name=${encodeURIComponent(selected)}`
    : `${BACKEND}/flatmap/image?gene=${gene}`;

  return (
    <div>
      <div className="flex gap-3 items-center mb-3">
        <select
          className="border rounded-lg px-3 py-2"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Default (cluster colors)</option>
          {pathways.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div
        className="border rounded-lg shadow bg-white p-2"
        style={{ marginTop: "1rem" }} // 👈 pushes image lower
      >
        {gene ? (
          <img
            key={imgUrl}
            src={imgUrl}
            alt={`${gene} Flatmap`}
            style={{ width: "100%", maxHeight: "480px", objectFit: "contain" }}
          />
        ) : (
          <p className="text-gray-500">No gene selected.</p>
        )}
      </div>
    </div>
  );
}

