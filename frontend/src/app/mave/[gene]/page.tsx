"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ResponsiveHeatMap } from "@nivo/heatmap";

const BACKEND = "http://127.0.0.1:8001";

export default function MavePage() {
  const { gene } = useParams<{ gene: string }>();
  const [data, setData] = useState<any[]>([]);
  const [clusterColors, setClusterColors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);

  // --- Fetch data ---
  useEffect(() => {
    if (!gene) return;
    fetch(`${BACKEND}/mave/data?gene=${gene}`)
      .then((r) => r.json())
      .then((json) => {
        console.log("✅ Sample MAVE data:", json.slice(0, 5));
        setData(json);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [gene]);

  // --- Fetch cluster colors ---
  useEffect(() => {
    if (!gene) return;
    fetch(`${BACKEND}/clusters/colors?gene=${gene}`)
      .then((r) => r.json())
      .then((json) => {
        console.log("🎨 Cluster colors:", Object.keys(json).slice(0, 10));
        setClusterColors(json);
      })
      .catch(() => setClusterColors({}));
  }, [gene]);

  // --- Format data for Nivo ---
  const positions = Array.from(new Set(data.map((d) => d.position))).sort((a, b) => a - b);
  const aas = Array.from(new Set(data.map((d) => d.to)));

  // ✅ Force all x-values (positions) to be integer strings for stable key mapping
  const rows = aas.map((aa) => ({
    id: aa,
    data: positions.map((pos) => {
      const entry = data.find((d) => d.to === aa && d.position === pos);
      const xKey = String(Math.round(pos)); // ensure consistent key format
      return { x: xKey, y: entry ? entry.score : null };
    }),
  }));

  if (loading) return <p className="p-6">Loading MAVE data for {gene}...</p>;
  if (data.length === 0)
    return <p className="p-6 text-gray-500">No MAVE data found for {gene}.</p>;

  // --- Dynamic tick reduction for long proteins ---
  const tickInterval = Math.ceil(positions.length / 25);
  const visibleTicks = positions.filter((_, i) => i % tickInterval === 0).map(String);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#77A9D8] mb-6">
        {gene} — MAVE Functional Landscape
      </h1>

      <div style={{ height: "650px" }}>
        <ResponsiveHeatMap
          data={rows}
          margin={{ top: 60, right: 40, bottom: 100, left: 80 }}
          colors={{
            type: "diverging",
            scheme: "red_yellow_blue",
            divergeAt: 0.5,
            minValue: -2,
            maxValue: 2,
          }}
          emptyColor="#f5f5f5"
          borderWidth={2}
          borderColor={(cell) => {
            const key = String(Math.round(Number(cell.x))).trim();
            const color = clusterColors[key];
            if (!color) {
              console.log(
                "⚠️ No color match for",
                key,
                "available keys:",
                Object.keys(clusterColors).slice(0, 10)
              );
            }
            return color || "#ddd";
          }}
          enableLabels={false} // ✅ hide numbers inside squares
          labelTextColor="#000"
          axisTop={{
            tickSize: 5,
            tickPadding: 3,
            tickRotation: -45,
            format: (d) => (visibleTicks.includes(d) ? d : ""), // ✅ only show selected ticks
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 3,
            tickRotation: 0,
          }}
          legends={[
            {
              anchor: "bottom",
              direction: "row",
              translateY: 60,
              itemWidth: 100,
              itemHeight: 14,
              symbolSize: 18,
              title: "Functional Score",
            },
          ]}
          tooltip={() => null}
          isInteractive={false}
        />
      </div>
    </div>
  );
}
