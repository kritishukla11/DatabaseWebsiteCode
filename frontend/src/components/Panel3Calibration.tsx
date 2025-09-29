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
    const url = `${BACKEND}/calibration/image?gene=${encodeURIComponent(
      gene
    )}&_ts=${Date.now()}`;
    console.log("Calibration image URL:", url);
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
        <p className="text-gray-500">Loading calibration plot...</p>
      ) : (
        <img
          key={`calibration-${gene}-${imgUrl}`} // ✅ unique key
          src={imgUrl}
          alt={`Calibration plot for ${gene}`}
          style={{
            width: "90%",
            height: "90%",
            maxWidth: "800px",
            maxHeight: "600px",
            margin: "0 auto",
            display: "block",
            objectFit: "contain",
          }}
        />
      )}
    </div>
  );
}




