"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ResponsiveHeatMap } from "@nivo/heatmap";

export default function MavePage() {
  const { gene } = useParams();
  const [data, setData] = useState<any[]>([]);
  const [clusterColors, setClusterColors] = useState<{ [pos: number]: string }>({});

  useEffect(() => {
    fetch(`http://127.0.0.1:8001/mave/data?gene=${gene}`)
      .then((r) => r.json())
      .then(setData);
  }, [gene]);

  useEffect(() => {
    // Load cluster colors if you have them exposed via /clusters/colors
    fetch(`http://127.0.0.1:8001/clusters/colors?gene=${gene}`)
      .then((r) => r.json())
      .then(setClusterColors);
  }, [gene]);

  // Transform to heatmap structure for Nivo
  const positions = Array.from(new Set(data.map((d) => d.position))).sort((a, b) => a - b);
  const aas = Array.from(new Set(data.map((d) => d.to)));
  const rows = aas.map((aa) => ({
    id: aa,
    data: positions.map((pos) => ({
      x: pos.toString(),
      y: data.find((d) => d.to === aa && d.position === pos)?.score ?? null,
    })),
  }));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">
        {gene} — MAVE Functional Landscape
      </h1>
      <div className="h-[600px]">
        <ResponsiveHeatMap
          data={rows}
          colors={{ type: "sequential", scheme: "purple_orange" }}
          margin={{ top: 100, right: 60, bottom: 60, left: 100 }}
          borderColor={(e) => clusterColors[e.x] || "white"} // outline with cluster color
          axisTop={{ tickRotation: -45 }}
          labelTextColor="#333"
        />
      </div>
    </div>
  );
}
