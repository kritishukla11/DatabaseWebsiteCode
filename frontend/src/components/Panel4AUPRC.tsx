"use client";

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel4AUPRC({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!gene) {
      setImgUrl(null);
      return;
    }
    const url = `${BACKEND}/auprc/image?gene=${encodeURIComponent(
      gene
    )}&_ts=${Date.now()}`;
    setImgUrl(url);
  }, [gene]);

  return (
    <div
      className="border rounded-lg shadow bg-white p-2"
      style={{ display: "flex", justifyContent: "center", minHeight: "400px" }}
    >
      {!gene ? (
        <p className="text-gray-500">No gene selected.</p>
      ) : !imgUrl ? (
        <p className="text-gray-500">Loading AUPRC plot...</p>
      ) : (
        <img
          key={`auprc-${imgUrl}`}
          src={imgUrl}
          alt={`AUPRC plot for ${gene}`}
          style={{
            width: "100%",
            height: "auto",
            maxWidth: "800px",
            margin: "0 auto",
            display: "block",
          }}
        />
      )}
    </div>
  );
}

