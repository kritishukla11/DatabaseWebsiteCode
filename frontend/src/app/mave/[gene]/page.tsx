"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ResponsiveHeatMap } from "@nivo/heatmap";

const BACKEND = "http://127.0.0.1:8001";

export default function MavePage() {
  const { gene } = useParams<{ gene: string }>();
  const [data, setData] = useState<any[]>([]);
  const [clusterColors, setClusterColors] = useState<{ [key: string]: string }>({});
  const [legend, setLegend] = useState<{ [color: string]: string }>({});
  const [loading, setLoading] = useState(true);

  // --- Fetch MAVE data ---
  useEffect(() => {
    if (!gene) return;
    setLoading(true);
    fetch(`${BACKEND}/mave/data?gene=${gene}`)
      .then((r) => r.json())
      .then((json) => {
        console.log("✅ Sample MAVE data:", json.slice(0, 5));
        setData(json);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [gene]);

  // --- Fetch cluster border colors ---
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

  // --- Fetch legend (color → annotation) ---
  useEffect(() => {
    if (!gene) return;
    fetch(`${BACKEND}/mave/legend?gene=${gene}`)
      .then((r) => r.json())
      .then((json) => {
        console.log("📘 MAVE legend:", json);
        setLegend(json);
      })
      .catch(() => setLegend({}));
  }, [gene]);

  // --- Prepare data for Nivo Heatmap ---
  const positions = Array.from(new Set(data.map((d) => d.position))).sort((a, b) => a - b);
  const aas = Array.from(new Set(data.map((d) => d.to)));

  const rows = aas.map((aa) => ({
    id: aa,
    data: positions.map((pos) => {
      const entry = data.find((d) => d.to === aa && d.position === pos);
      const xKey = String(Math.round(pos));
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

      {/* --- Main heatmap --- */}
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
          borderColor={(cell) => clusterColors[cell.data.x] || "#ddd"}
          enableLabels={false}
          labelTextColor="#000"
          axisTop={{
            tickSize: 5,
            tickPadding: 3,
            tickRotation: -45,
            format: (d) => (visibleTicks.includes(d) ? d : ""),
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

      {/* --- RFI annotation legend --- */}
      {Object.keys(legend).length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">
            Region of Functional Interest (RFI)
          </h2>
          <div className="flex flex-wrap gap-4">
            {Object.entries(legend).map(([color, label]) => (
              <div key={color} className="flex items-center space-x-2">
                <div
                  style={{
                    backgroundColor: color,
                    width: "16px",
                    height: "16px",
                    borderRadius: "4px",
                    border: "1px solid #888",
                  }}
                ></div>
                <span className="text-sm text-gray-800">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
