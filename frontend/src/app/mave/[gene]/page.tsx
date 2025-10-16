"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ResponsiveHeatMap } from "@nivo/heatmap";

const BACKEND = "http://127.0.0.1:8001";

// Simple color name mapping for known palette
const COLOR_NAMES: Record<string, string> = {
  "#e41a1c": "red",
  "#377eb8": "blue",
  "#4daf4a": "green",
  "#984ea3": "purple",
  "#ff7f00": "orange",
  "#ffff33": "yellow",
  "#a65628": "brown",
  "#f781bf": "pink",
  "#999999": "gray",
};

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
      .then((json) => setData(json))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [gene]);

  // --- Fetch cluster border colors ---
  useEffect(() => {
    if (!gene) return;
    fetch(`${BACKEND}/clusters/colors?gene=${gene}`)
      .then((r) => r.json())
      .then((json) => setClusterColors(json))
      .catch(() => setClusterColors({}));
  }, [gene]);

  // --- Fetch legend (color → annotation) ---
  useEffect(() => {
    if (!gene) return;
    fetch(`${BACKEND}/mave/legend?gene=${gene}`)
      .then((r) => r.json())
      .then((json) => setLegend(json))
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

  // --- Helper: readable color name ---
  const getColorName = (hex: string): string => {
    const lower = hex.toLowerCase();
    return COLOR_NAMES[lower] || lower;
  };

  return (
    <div className="p-6">
      {/* --- Header --- */}
      <h1 className="text-2xl font-bold text-[#77A9D8] mb-4">
        {gene}: MAVE Functional Landscape
      </h1>

      {/* --- Explanation paragraph --- */}
      <div className="max-w-5xl mx-auto mb-20 pb-48 text-gray-700 leading-relaxed text-[15px]">
        <p className="mb-3">
          <strong className="text-[#77A9D8]">What is MAVE?</strong>{" "}
          Multiplex Assays of Variant Effect (MAVEs) are high-throughput
          experiments that measure how thousands of genetic variants affect gene
          or protein function in parallel. In a typical MAVE, a comprehensive
          library of variants is generated for a target gene and tested using a
          functional readout such as expression, activity, or growth rate.
        </p>
        <p>
          The resulting variant effect maps reveal which mutations are
          deleterious, neutral, or beneficial, providing insights into protein
          structure-function relationships, disease mechanisms, and variant
          interpretation. All data shown here are curated from{" "}
          <a
            href="https://doi.org/10.1186/s13059-025-03476-y"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#77A9D8] underline hover:text-[#5598c8]"
          >
            MaveDB
          </a>{" "}
          (Rubin et al., <em>Genome Biology</em>, 2025), a community database of
          multiplexed functional assays.
        </p>
        <p>&nbsp;</p>
        <p>&nbsp;</p>
        <div className="h-10" />
      </div>

      {/* Spacer */}
      <div className="mt-8 mb-8 h-6" />

      {/* --- Text-based legend --- */}
      {Object.keys(legend).length > 0 && (
        <div className="mb-6 text-center mt-12">
          <h2 className="text-lg font-semibold mb-2 text-[#77A9D8] mt-10">
            Region of Functional Interest (RFI)
          </h2>
          <p className="text-sm text-gray-800 flex flex-wrap justify-center gap-x-8 gap-y-2">
            {Object.entries(legend).map(([color, label], idx) => {
              const name = getColorName(color);
              return (
                <span key={color} className="whitespace-nowrap">
                  <span style={{ color: color, fontWeight: 600 }}>
                    {name}:
                  </span>{" "}
                  {label}
                  {idx < Object.keys(legend).length - 1 && (
                    <span className="mx-3"> </span>
                  )}
                </span>
              );
            })}
          </p>
        </div>
      )}

      {/* --- Main heatmap --- */}
      <div
        style={{
          height: "650px",
          pointerEvents: "none", // ✅ prevents overlay issues
        }}
      >
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
