"use client";

import { useEffect, useState } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function Panel3Calibration({ gene }: { gene: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!gene) {
      setImgUrl(null);
      return;
    }
    setImgUrl(`${BACKEND}/calibration/image?gene=${encodeURIComponent(gene)}`);
  }, [gene]);

  return (
    <div className="border rounded-lg shadow bg-white p-2"
         style={{ display: "flex", justifyContent: "center" }}>
      {imgUrl ? (
        <img
            key={imgUrl}
            src={imgUrl}
            alt={`Calibration plot for ${gene}`}
            style={{
                width: "100%",
                height: "auto",   // full height
                maxWidth: "800px", // make it bigger
                margin: "0 auto",  // center horizontally
                display: "block"
            }}
        />

      ) : (
        <p className="text-gray-500">No gene selected.</p>
      )}
    </div>
  );
}
