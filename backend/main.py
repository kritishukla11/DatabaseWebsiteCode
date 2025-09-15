# backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import json
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import re
import math
import io
import time
import traceback

# --- matplotlib headless backend (for Panel 2) ---
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, TwoSlopeNorm
from scipy.interpolate import griddata
from matplotlib import cm
import matplotlib.patheffects as patheffects

# -----------------------
# FastAPI app
# -----------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Backend is running!"}

# =========================================================
# =============== PANEL 5: /plot endpoints ================
# =========================================================

OUT_DIR = Path("protein_map_outputs")  # must contain manifest.json

def _load_artifacts(base: Path = OUT_DIR):
    t0 = time.time()
    man_path = base / "manifest.json"
    if not man_path.exists():
        raise RuntimeError(f"manifest.json not found under {base.resolve()}")
    with open(man_path) as f:
        m = json.load(f)

    vecs_path   = base / m["vectors_parquet"]
    coords_path = base / m["coords_parquet"]

    if not vecs_path.exists():
        raise RuntimeError(f"vectors parquet missing: {vecs_path.resolve()}")
    if not coords_path.exists():
        raise RuntimeError(f"coords parquet missing: {coords_path.resolve()}")

    vecs   = pd.read_parquet(vecs_path).set_index("protein_id")
    coords = pd.read_parquet(coords_path)

    if "protein_id" not in coords.columns or "x" not in coords.columns or "y" not in coords.columns:
        raise RuntimeError("coords parquet must have columns: protein_id, x, y")

    # Normalize vectors once for cosine
    V = vecs.values.astype(np.float32)
    V = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-12)
    ids = vecs.index.to_numpy()

    print(f"[LOAD] vectors={V.shape} coords={coords.shape} in {time.time()-t0:.3f}s")
    return m, vecs, coords, V, ids

try:
    _MAN, _VECS_DF, _COORDS, _V_NORM, _IDS = _load_artifacts()
except Exception as e:
    # Don’t crash app; expose clear message on /plot_ping
    _MAN = {}
    _VECS_DF = pd.DataFrame()
    _COORDS = pd.DataFrame(columns=["protein_id","x","y"])
    _V_NORM = np.zeros((0,0), dtype=np.float32)
    _IDS = np.array([], dtype=object)
    print("[LOAD][ERROR]", e)
    traceback.print_exc()

def _topk_cosine(query_protein: str, k: int = 10) -> pd.DataFrame:
    if _V_NORM.size == 0 or _VECS_DF.empty:
        raise RuntimeError("Embeddings not loaded. Check protein_map_outputs/manifest.json and parquet files.")

    if query_protein not in _VECS_DF.index:
        raise KeyError(f"{query_protein} not found in vectors index")

    q = _VECS_DF.loc[query_protein].values.astype(np.float32)
    q = q / (np.linalg.norm(q) + 1e-12)        # normalize query once

    sims = _V_NORM @ q                          # (N, D) dot (D,) -> (N,)
    # remove self
    idx_self = np.where(_IDS == query_protein)[0]
    if idx_self.size:
        sims[idx_self[0]] = -np.inf

    k = int(max(1, min(k, len(sims)-1)))
    topk_idx = np.argpartition(-sims, kth=k)[:k]
    order = np.argsort(-sims[topk_idx])
    topk_idx = topk_idx[order]

    return pd.DataFrame({
        "protein_id": _IDS[topk_idx],
        "cosine_sim": sims[topk_idx].astype(float)
    })

def _shared_pathways(query_protein: str, others: list[str], thresh: float = 0.0) -> pd.DataFrame:
    # pathways = vector columns
    if _VECS_DF.empty:
        return pd.DataFrame(columns=["other_protein","pathway_id","score_query","score_other","joint_score"])

    q_vec = _VECS_DF.loc[query_protein]
    q_present = (q_vec > thresh).values
    pathways = _VECS_DF.columns.to_numpy()

    out = []
    for pid in others:
        if pid not in _VECS_DF.index:
            continue
        p_vec = _VECS_DF.loc[pid]
        both = q_present & (p_vec.values > thresh)
        if not np.any(both):
            continue
        shared = pathways[both]
        q_scores = q_vec[both].values
        p_scores = p_vec[both].values
        joint = q_scores * p_scores
        for pw, sq, sp, js in zip(shared, q_scores, p_scores, joint):
            out.append({
                "other_protein": pid,
                "pathway_id": pw,
                "score_query": float(sq),
                "score_other": float(sp),
                "joint_score": float(js),
            })
    if not out:
        return pd.DataFrame(columns=["other_protein","pathway_id","score_query","score_other","joint_score"])
    return (pd.DataFrame(out)
            .sort_values(["other_protein","joint_score"], ascending=[True, False])
            .reset_index(drop=True))

def _plot_network(query: str, nbrs_df: pd.DataFrame, nn_edge_threshold: float = 0.6) -> go.Figure:
    keep = [query] + nbrs_df["protein_id"].tolist()
    pos = _COORDS[_COORDS["protein_id"].isin(keep)].set_index("protein_id")[["x","y"]].copy()

    # fill missing coords near query
    missing = set(keep) - set(pos.index)
    if missing:
        cx, cy = (pos.loc[query].values if query in pos.index else (0.0, 0.0))
        r = 0.05
        for i, pid in enumerate(sorted(missing)):
            ang = 2 * math.pi * i / max(1, len(missing))
            pos.loc[pid, "x"] = cx + r * math.cos(ang)
            pos.loc[pid, "y"] = cy + r * math.sin(ang)

    # normalize [-1,1]
    for col in ["x","y"]:
        mn, mx = pos[col].min(), pos[col].max()
        if mx > mn:
            pos[col] = (pos[col] - mn) / (mx - mn) * 2 - 1

    # --- Query → Neighbor edges (blue)
    xe_q2n, ye_q2n = [], []
    for pid in nbrs_df["protein_id"]:
        xe_q2n += [pos.loc[query,"x"], pos.loc[pid,"x"], None]
        ye_q2n += [pos.loc[query,"y"], pos.loc[pid,"y"], None]
    e_q2n = go.Scatter(
        x=xe_q2n, y=ye_q2n, mode="lines",
        line=dict(width=1.2, color="blue"),
        opacity=0.5, hoverinfo="none", name=f"{query} connections"
    )

    # --- Neighbor ↔ Neighbor edges (orange if cosine > threshold)
    xe_nn, ye_nn = [], []
    for i, pid1 in enumerate(nbrs_df["protein_id"]):
        for j, pid2 in enumerate(nbrs_df["protein_id"]):
            if j <= i: 
                continue
            v1 = _VECS_DF.loc[pid1].values.astype(np.float32)
            v2 = _VECS_DF.loc[pid2].values.astype(np.float32)
            sim = float(np.dot(v1, v2) / ((np.linalg.norm(v1) * np.linalg.norm(v2)) + 1e-12))
            if sim > nn_edge_threshold:
                xe_nn += [pos.loc[pid1,"x"], pos.loc[pid2,"x"], None]
                ye_nn += [pos.loc[pid1,"y"], pos.loc[pid2,"y"], None]
    e_nn = go.Scatter(
        x=xe_nn, y=ye_nn, mode="lines",
        line=dict(width=1, color="orange"),
        opacity=0.4, hoverinfo="none", name="Other connections" 
    )

    # --- Nodes
    cos_by_id = {r["protein_id"]: r["cosine_sim"] for _, r in nbrs_df.iterrows()}
    ids = nbrs_df["protein_id"].tolist()
    n_nbrs = go.Scatter(
        x=pos.loc[ids,"x"], y=pos.loc[ids,"y"],
        mode="markers+text", text=ids, textposition="top center", textfont=dict(size=9),
        hovertext=[f"{pid}<br>cos={cos_by_id[pid]:.3f}" for pid in ids],
        hoverinfo="text",
        marker=dict(size=10, color=[cos_by_id[pid] for pid in ids],
                    colorscale="Blues", showscale=True, colorbar=dict(title="Cosine")),
        name="Closest proteins" 
    )
    n_query = go.Scatter(
        x=[pos.loc[query,"x"]], y=[pos.loc[query,"y"]],
        mode="markers+text", text=[query],
        textposition="top center", textfont=dict(size=12, color="black"),
        marker=dict(size=14, color="red", line=dict(width=1, color="black")),
        name=f"{query}" 
    )

    fig = go.Figure([e_q2n, e_nn, n_nbrs, n_query])
    fig.update_layout(
        title=f"Top {len(nbrs_df)} Nearest Neighbors of {query}",
        height=650,
        xaxis=dict(visible=False, showgrid=False, zeroline=False),
        yaxis=dict(visible=False, showgrid=False, zeroline=False),
        margin=dict(l=10, r=10, t=50, b=10),
        showlegend=True,  # ✅ keep legend visible
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=-0.2,          # 👈 space below the plot
            xanchor="center",
            x=0.5,
            bgcolor="rgba(255,255,255,0.7)",
            bordercolor="black",
            borderwidth=0.5
        )
    )
    return fig


@app.get("/plot_ping", response_class=PlainTextResponse)
def plot_ping(gene: str = "KEAP1"):
    """
    Lightweight sanity check for Panel 5. Returns timing + quick stats or an error message.
    """
    t0 = time.time()
    try:
        if _V_NORM.size == 0 or _VECS_DF.empty:
            return "[plot_ping] ERROR: embeddings not loaded. Check manifest/parquet paths."

        if gene not in _VECS_DF.index:
            return f"[plot_ping] ERROR: gene '{gene}' not in vectors index (N={len(_VECS_DF)})."

        nbrs = _topk_cosine(gene, k=10)
        return f"[plot_ping] OK in {time.time()-t0:.3f}s; neighbors={len(nbrs)} first={nbrs.iloc[0]['protein_id'] if len(nbrs) else 'NA'}"
    except Exception as e:
        return f"[plot_ping] EXCEPTION: {e}\n{traceback.format_exc()}"

@app.get("/plot")
def get_plot(gene: str, topk: int = 10):
    t0 = time.time()
    try:
        if _V_NORM.size == 0 or _VECS_DF.empty:
            raise RuntimeError("Embeddings not loaded. See server logs for load errors.")

        if gene not in _VECS_DF.index:
            raise KeyError(f"Gene '{gene}' not found in vectors index.")

        nbrs_df = _topk_cosine(gene, k=topk)
        shared_pw = _shared_pathways(gene, nbrs_df["protein_id"].tolist())
        fig = _plot_network(gene, nbrs_df)

        out = {
            "plot": fig.to_plotly_json(),
            "neighbors": nbrs_df.to_dict(orient="records"),
            "shared_pathways": shared_pw.to_dict(orient="records"),
            "elapsed_sec": round(time.time()-t0, 3),
        }
        return JSONResponse(content=out)
    except KeyError as e:
        return JSONResponse(content={"error": str(e)}, status_code=404)
    except Exception as e:
        print("[/plot][ERROR]", e)
        traceback.print_exc()
        return JSONResponse(content={"error": f"Internal error: {str(e)}"}, status_code=500)

# =========================================================
# ========= PANEL 2: /flatmap endpoints (matplotlib) ======
# =========================================================

DATA_DIR = Path(__file__).resolve().parent / "data"

def load_nmf(gene: str) -> pd.DataFrame:
    """Load nmfinfo file for a given gene."""
    fn = DATA_DIR / f"{gene}_nmfinfo_final.csv"
    if not fn.exists():
        raise HTTPException(status_code=404, detail=f"No nmfinfo file for {gene}")
    nmf = pd.read_csv(fn)
    nmf = nmf.rename(columns={"x_axis": "x", "y_axis": "y", "clust": "cluster"})
    nmf["x_r"] = nmf["x"].round(6)
    nmf["y_r"] = nmf["y"].round(6)
    return nmf

POINT_RX = re.compile(r"POINT\s*\(([-0-9\.Ee+]+)\s+([-0-9\.Ee+]+)\)")
def parse_wkt_point(s: str):
    m = POINT_RX.search(str(s))
    if not m:
        return None, None
    return float(m.group(1)), float(m.group(2))

def list_pathways_for_gene(gene: str) -> list[str]:
    """Return available pathway names for this gene based on *_GSEA.csv_gdf.csv files."""
    paths = []
    for p in DATA_DIR.glob(f"{gene}_*_GSEA.csv_gdf.csv"):
        m = re.match(fr"{gene}_(.+?)_GSEA\.csv_gdf\.csv$", p.name)
        if m:
            paths.append(m.group(1))
    return sorted(paths)

@app.get("/flatmap/pathways")
def flatmap_pathways(gene: str):
    return {"pathways": list_pathways_for_gene(gene)}

@app.get("/flatmap/image")
def flatmap_image(gene: str, name: str | None = None, collapse: str = "max"):
    """
    Returns a PNG flatmap.
    - Default (no pathway): categorical clusters, clipped to mask.
    - Pathway-specific: clusters colored by GI* (mean/max), clipped to mask.
    - collapse: "max" or "mean".
    """
    df = load_nmf(gene)

    gi_vals = None
    if name:
        fn = DATA_DIR / f"{gene}_{name}_GSEA.csv_gdf.csv"
        if not fn.exists():
            raise HTTPException(status_code=404, detail=f"No file for pathway {name}")
        gdf = pd.read_csv(fn)
        if "geometry" not in gdf.columns or "Gi_sum" not in gdf.columns:
            raise HTTPException(status_code=400, detail=f"Expected 'geometry' and 'Gi_sum' in {fn.name}")

        # Parse WKT points -> (x, y)
        xy = gdf["geometry"].apply(parse_wkt_point).apply(pd.Series)
        xy.columns = ["x", "y"]
        gdf = pd.concat([gdf, xy], axis=1)
        gdf["x_r"] = gdf["x"].round(6)
        gdf["y_r"] = gdf["y"].round(6)

        # Collapse GI* values per residue
        if collapse == "mean":
            collapsed = gdf.groupby(["x_r", "y_r"])["Gi_sum"].mean().reset_index()
        else:
            collapsed = gdf.groupby(["x_r", "y_r"])["Gi_sum"].max().reset_index()

        merged = pd.merge(df, collapsed, on=["x_r", "y_r"], how="left")
        gi_vals = merged["Gi_sum"].fillna(0.0).astype(float)
    else:
        merged = df

    # --- Plotting ---
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.set_aspect("equal")
    ax.axis("off")

    xmn, xmx = df["x"].min(), df["x"].max()
    ymn, ymx = df["y"].min(), df["y"].max()
    pad_x = 0.05 * (xmx - xmn)
    pad_y = 0.05 * (ymx - ymn)
    xmn_pad, xmx_pad = xmn - pad_x, xmx + pad_x
    ymn_pad, ymx_pad = ymn - pad_y, ymx + pad_y

    nx, ny = 400, 400
    xi = np.linspace(xmn_pad, xmx_pad, nx)
    yi = np.linspace(ymn_pad, ymx_pad, ny)
    Xi, Yi = np.meshgrid(xi, yi)

    # Cluster grid (categorical)
    cmap_clusters = ListedColormap(["#e74c3c","#8e44ad","#1f77b4","#f1c40f","#2ecc71"])
    Zi_cluster = griddata((df["x"], df["y"]), df["cluster"], (Xi, Yi), method="nearest")

    # Altitude grid
    Zi_alt = griddata((df["x"], df["y"]), df["altitude"], (Xi, Yi), method="linear")
    if isinstance(Zi_alt, np.ma.MaskedArray):
        Zi_alt = Zi_alt.filled(np.nan)

    # Mask definition from altitude
    outer_mask = np.isnan(Zi_alt) | (Zi_alt <= np.nanmin(Zi_alt) + 1e-6)
    inside_mask = (~outer_mask).astype(float)

    # Precompute masked fields
    Zi_cluster_masked = np.ma.array(Zi_cluster, mask=outer_mask)
    Zi_alt_masked     = np.ma.array(Zi_alt,     mask=outer_mask)

    if gi_vals is None:
        # --- Default cluster view ---
        cmap_clusters_plot = ListedColormap(list(getattr(cmap_clusters, "colors", [])))
        try:
            cmap_clusters_plot.set_bad(alpha=0.0)
        except Exception:
            pass

        ax.imshow(Zi_cluster_masked, origin="lower",
                  extent=(xmn_pad, xmx_pad, ymn_pad, ymx_pad),
                  cmap=cmap_clusters_plot, alpha=0.25,
                  interpolation="nearest", zorder=0)

        ax.contour(Xi, Yi, Zi_cluster_masked, levels=np.unique(df["cluster"]),
                   colors="black", linewidths=0.8, alpha=0.6, zorder=4)

        sm = plt.cm.ScalarMappable(cmap=cmap_clusters, norm=plt.Normalize(vmin=0, vmax=4))
        cbar = plt.colorbar(sm, ax=ax, fraction=0.046, pad=0.04,
                            ticks=[0.5,1.5,2.5,3.5,4.5])
        cbar.ax.set_yticklabels([])
        cbar.set_label("Clusters")

        colors = [cmap_clusters(c % cmap_clusters.N) for c in df["cluster"].to_numpy()]
        ax.scatter(df["x"], df["y"], c=colors, s=150,
                   edgecolors="black", linewidths=0.2, alpha=0.95, zorder=3)

    else:
        # --- Pathway-specific ---
        merged["cluster"] = merged["cluster"].astype(int)
        if collapse == "mean":
            cluster_scores = merged.groupby("cluster")["Gi_sum"].mean()
        else:
            cluster_scores = merged.groupby("cluster")["Gi_sum"].max()

        Zi_gi_cluster = np.zeros_like(Zi_cluster, dtype=float)
        for clust, score in cluster_scores.items():
            Zi_gi_cluster[Zi_cluster == clust] = score

        cmap_redgreen = plt.cm.RdYlGn_r
        vmax = max(1.0, float(np.nanpercentile(np.abs(cluster_scores), 99)))
        norm = plt.Normalize(vmin=0, vmax=vmax)

        Zi_gi_masked = np.ma.array(Zi_gi_cluster, mask=outer_mask)
        im = ax.imshow(Zi_gi_masked, origin="lower",
                       extent=(xmn_pad, xmx_pad, ymn_pad, ymx_pad),
                       cmap=cmap_redgreen, norm=norm, alpha=0.6,
                       interpolation="nearest", zorder=1)

        ax.contour(Xi, Yi, Zi_cluster_masked, levels=np.unique(df["cluster"]),
                   colors="black", linewidths=1.2, alpha=0.9, zorder=4)

        ax.scatter(merged["x"], merged["y"], s=150,
                   edgecolors="darkgrey", facecolors="none", linewidths=0.7, zorder=3)

        cb = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cb.set_label(f"Cluster GI* ({collapse})\nGreen = Low, Red = High")

    # ---------- Altitude + Border ----------
    ax.contour(Xi, Yi, Zi_alt_masked, levels=40,
               colors="darkgrey", alpha=0.3, linewidths=0.5, zorder=5)

    ax.contour(Xi, Yi, inside_mask, levels=[0.5],
               colors="black", linewidths=2.5, zorder=6)

    # ---------- Cluster Annotations ----------
    try:
        ann_path = DATA_DIR / "annotated_clusters.csv"
        if ann_path.exists():
            ann = pd.read_csv(ann_path)
            ann["cluster"] = ann["cluster"].astype(int)
            df["cluster"] = df["cluster"].astype(int)

            ann_sub = ann[ann["gene"].str.upper() == gene.upper()]
            if not ann_sub.empty:
                centroids = df.groupby("cluster")[["x", "y"]].mean()
                for _, row in ann_sub.iterrows():
                    clust = row["cluster"]
                    label = str(row["annotation_type"])
                    if clust in centroids.index:
                        cx, cy = centroids.loc[clust]
                        ax.text(
                            cx, cy, label,
                            ha="center", va="center",
                            fontsize=10, fontweight="bold",
                            color="white",
                            path_effects=[
                                patheffects.Stroke(linewidth=2, foreground="black"),
                                patheffects.Normal()
                            ],
                            zorder=10
                        )
    except Exception as e:
        print("[flatmap_image][WARN] Could not add annotations:", e)

    # ------------------------------------------------------------------
    ax.set_xlim(xmn_pad, xmx_pad)
    ax.set_ylim(ymn_pad, ymx_pad)
    fig.tight_layout(pad=0)

    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=170, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")



# =========================================================
# ========= PANEL 3: /empirical (matplotlib) ======
# =========================================================
# Path to your calibration CSV
CALIBRATION_DF = pd.read_csv("calibration.csv")
@app.get("/calibration/image")
def calibration_image(gene: str):
    # filter rows for this gene
    sub = CALIBRATION_DF[CALIBRATION_DF["gene"] == gene]
    if sub.empty:
        return Response(status_code=404)

    # make plot
    fig, ax = plt.subplots()
    ax.plot(sub["adjusted_rank"], sub["confidence"])
    ax.set_xlabel("Rank (from computational method)")
    ax.set_ylabel("Confidence (% significant)")
    ax.grid(False)

    # save to PNG buffer
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)

    return Response(content=buf.read(), media_type="image/png")

