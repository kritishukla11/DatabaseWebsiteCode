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
import hashlib
from huggingface_hub import hf_hub_download
import fsspec
import os

# --- matplotlib headless backend (for Panel 2) ---
import matplotlib
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib_cache"
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from threading import Lock
PLOT_LOCK = Lock()
from matplotlib.colors import ListedColormap, TwoSlopeNorm
from scipy.interpolate import griddata
from matplotlib import cm
import matplotlib.patheffects as patheffects

# -----------------------
# FastAPI app
# -----------------------
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

app = FastAPI()

origins = [
    "https://starmap-frontend-dept-brunklab.apps.cloudapps.unc.edu",
    "https://starmap.unc.edu",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
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

def has_annotations(protein: str) -> bool:
    """
    Returns True if the protein has at least one nonzero pathway score.
    """
    if protein not in _VECS_DF.index:
        return False
    row = _VECS_DF.loc[protein]
    return (row > 0).any()


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
    
@app.get("/check_gene")
def check_gene(gene: str):
    """
    Returns an error if the gene is not found in all_proteins_max_score_matrix_cleaned.csv.
    """
    if not gene_in_master_matrix(gene):
        return JSONResponse(
            content={"error": f"Sorry, we don't have info for {gene}."},
            status_code=404
        )
    return {"message": "Gene found."}


@app.get("/plot")
def get_plot(gene: str, topk: int = 10):
    t0 = time.time()
    try:
        if _V_NORM.size == 0 or _VECS_DF.empty:
            # Still a genuine server issue
            return JSONResponse(
                content={"plot": None, "neighbors": [], "shared_pathways": [], "message": "Panel 5 data not loaded."},
                status_code=200
            )

        # Case 1: gene not in dataset → return empty instead of 404
        if gene not in _VECS_DF.index:
            return JSONResponse(
                content={
                    "plot": None,
                    "neighbors": [],
                    "shared_pathways": [],
                    "message": f"No Panel 5 data available for {gene}."
                },
                status_code=200
            )

        # Case 2: gene exists but no pathway annotations
        if not has_annotations(gene):
            return JSONResponse(
                content={
                    "plot": None,
                    "neighbors": [],
                    "shared_pathways": [],
                    "message": f"No Panel 5 annotations available for {gene}."
                },
                status_code=200
            )

        # Normal case: return the real plot
        nbrs_df = _topk_cosine(gene, k=topk)
        shared_pw = _shared_pathways(gene, nbrs_df["protein_id"].tolist())
        fig = _plot_network(gene, nbrs_df)

        out = {
            "plot": fig.to_plotly_json(),
            "neighbors": nbrs_df.to_dict(orient="records"),
            "shared_pathways": shared_pw.to_dict(orient="records"),
            "elapsed_sec": round(time.time() - t0, 3),
        }
        return JSONResponse(content=out)

    except Exception as e:
        print("[/plot][WARN]", e)
        traceback.print_exc()
        # Return gracefully even on failure
        return JSONResponse(
            content={
                "plot": None,
                "neighbors": [],
                "shared_pathways": [],
                "message": f"Panel 5 unavailable ({str(e)})"
            },
            status_code=200
        )

    
@app.get("/group_label")
def get_group_label(gene: str):
    try:
        df = pd.read_csv("llm_group_labels.csv")  # keep file in backend directory
        row = df[df["gene"].str.upper() == gene.upper()]
        if row.empty:
            return {"group_label": None}
        return {"group_label": row.iloc[0]["llm_output"]}
    except Exception as e:
        return {"error": str(e)}
    
@app.get("/shared_pathway_groups")
def shared_pathway_groups(query: str, neighbor: str):
    """
    Returns functional groups and shared pathways between query and neighbor.
    - Drops joint_score <= 0
    - Normalizes scores so top score across ALL neighbors = 1
    - Filters out anything < 0.5 after normalization
    """
    try:
        # get top-k neighbors for query
        nbrs_df = _topk_cosine(query, k=10)
        if nbrs_df.empty:
            return {"groups": []}

        # compute shared pathways with ALL neighbors
        all_shared = _shared_pathways(query, nbrs_df["protein_id"].tolist())
        if all_shared.empty:
            return {"groups": []}

        # drop joint_score <= 0
        all_shared = all_shared[all_shared["joint_score"] > 0].copy()
        if all_shared.empty:
            return {"groups": []}

        # global normalization (max across ALL neighbors)
        max_val = all_shared["joint_score"].max()
        if max_val > 0:
            all_shared["joint_score"] = all_shared["joint_score"] / max_val
        else:
            return {"groups": []}

        # filter < 0 after normalization
        all_shared = all_shared[all_shared["joint_score"] >= 0.1]
        if all_shared.empty:
            return {"groups": []}

        # restrict back to this specific neighbor
        shared_df = all_shared[all_shared["other_protein"] == neighbor].copy()
        if shared_df.empty:
            return {"groups": []}

        # load group labels
        labels = pd.read_csv("tf_function_labels_10groups.csv")

        # merge shared pathways with functional groups
        merged = pd.merge(
            shared_df,
            labels,
            left_on="pathway_id",
            right_on="TF",   # adjust if column name differs
            how="inner"
        )

        # group and include both pathway + joint_score
        grouped = (
            merged.groupby("Group10")
            .apply(lambda g: g.sort_values("joint_score", ascending=False)[
                ["pathway_id", "joint_score"]
            ].to_dict(orient="records"))
            .reset_index()
            .rename(columns={0: "pathways"})
            .to_dict(orient="records")
        )

        return {"groups": grouped}

    except Exception as e:
        return {"error": str(e)}

@app.get("/gene_info")
def gene_info(gene: str):
    try:
        df = pd.read_csv("cleaned_mappings_2.csv")

        df["Gene Names"] = df["Gene Names"].astype(str).str.strip().str.upper()
        g = gene.strip().upper()

        row = df[df["Gene Names"] == g]
        if row.empty:
            return {"info": {}}

        record = row.iloc[0].to_dict()
        record.pop("Gene Names", None)

        # split values on semicolons for lists
        for k, v in record.items():
            if isinstance(v, str):
                record[k] = [x.strip() for x in v.split(";") if x.strip()]

        return {"info": record}

    except Exception as e:
        return {"error": str(e)}



# =========================================================
# ========= PANEL 2: /flatmap endpoints (matplotlib) ======
# =========================================================

from pathlib import Path
import re, io
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from matplotlib import cm, patheffects
from scipy.interpolate import griddata
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from functools import lru_cache

DATA_DIR = Path(__file__).resolve().parent / "data"

# ---------------- Palette (matches Panel1) ----------------
BASE_COLORS = [
    "#e41a1c", "#377eb8", "#4daf4a", "#984ea3",
    "#ff7f00", "#ffff33", "#a65628", "#f781bf",
    "#999999"
]

def make_cluster_cmap(n_clusters: int) -> ListedColormap:
    """Return ListedColormap using the same palette as Panel1, cycling if needed."""
    colors = [BASE_COLORS[i % len(BASE_COLORS)] for i in range(n_clusters)]
    return ListedColormap(colors)

# ---------------- Data loaders ----------------
@lru_cache(maxsize=128)
def load_gene_parquet(gene: str) -> pd.DataFrame:
    letter = gene[0].upper() if gene and gene[0].isalpha() else "OTHER"
    repo_id = "kritishukla/parquet_storage"
    filename = f"{letter}.parquet"

    try:
        parquet_url = f"hf://datasets/{repo_id}/{filename}"
        df = pd.read_parquet(
            parquet_url,
            engine="pyarrow",
            filters=[("gene", "==", gene.upper())]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load parquet {filename}: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {gene} in {filename}")

    # ✅ normalize column names once, everywhere else use lowercase
    df.columns = df.columns.str.lower()

    # (optional) keep pathway tidy without turning NaN into "nan"
    if "pathway" in df.columns:
        df["pathway"] = df["pathway"].where(df["pathway"].notna(), None)
        # strip whitespace for non-null paths
        df.loc[df["pathway"].notna(), "pathway"] = df.loc[df["pathway"].notna(), "pathway"].str.strip()

    return df



def normalize_clusters(series: pd.Series) -> pd.Series:
    """Normalize cluster labels to consecutive ints starting at 0."""
    unique = sorted(series.unique())
    mapping = {old: new for new, old in enumerate(unique)}
    return series.map(mapping), mapping

def load_nmf(gene: str, df: pd.DataFrame | None = None):
    if df is None:
        df = load_gene_parquet(gene)

    nmf = df[df["table"] == "nmfinfo"].copy()
    if nmf.empty:
        raise HTTPException(status_code=404, detail=f"No nmfinfo data for {gene}")

    nmf = nmf.rename(columns={"x_axis": "x", "y_axis": "y", "clust": "cluster"})
    nmf["x_r"] = nmf["x"].round(6)
    nmf["y_r"] = nmf["y"].round(6)
    nmf["cluster"], mapping = normalize_clusters(nmf["cluster"])
    return nmf, mapping


POINT_RX = re.compile(
    r"POINT\s*\(?\s*([-0-9\.Ee+]+)\s+([-0-9\.Ee+]+)\s*\)?", re.IGNORECASE
)

def parse_wkt_point(s: str):
    if not isinstance(s, str):
        return None, None
    m = POINT_RX.search(s)
    if not m:
        return None, None
    try:
        return float(m.group(1)), float(m.group(2))
    except ValueError:
        return None, None


def list_pathways_for_gene(gene: str) -> list[str]:
    df = load_gene_parquet(gene)
    gdfs = df[df["table"] == "gdf"]

    if gdfs.empty:
        return []

    # keep only pathways where Gi_sum > 0 at least once
    valid = (
        gdfs.groupby("pathway")["gi_sum"]
        .max()
        .reset_index()
    )
    valid = valid[valid["gi_sum"] > 0]

    return sorted(valid["pathway"].dropna().unique().tolist())



@lru_cache(maxsize=256)
def get_gi_global_range(gene: str):
    """Return global min/max of gi_sum across all pathways for this gene."""
    df = load_gene_parquet(gene)
    gdfs = df[df["table"] == "gdf"].copy()
    if gdfs.empty or "gi_sum" not in gdfs.columns:
        return 0.0, 1.0  # fallback default

    vmin = float(gdfs["gi_sum"].min(skipna=True))
    vmax = float(gdfs["gi_sum"].max(skipna=True))
    # Optional: add symmetric padding for aesthetic balance
    return vmin, vmax




# ---------------- Endpoints ----------------


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
    with PLOT_LOCK:  # 🧠 Prevent concurrent matplotlib writes
        df, mapping = load_nmf(gene)

        gi_vals = None
        if name:
            df_all = load_gene_parquet(gene)
            gdf = df_all[(df_all["table"] == "gdf") & (df_all["pathway"].str.upper() == name.upper())].copy()
            if gdf.empty:
                raise HTTPException(status_code=404, detail=f"No GDF data for pathway {name} in {gene}")

            if "geometry" not in gdf.columns or "gi_sum" not in gdf.columns:
                raise HTTPException(status_code=400, detail=f"GDF data missing required columns for {gene}, pathway={name}")


            # Parse WKT points -> (x, y)
            xy = gdf["geometry"].apply(parse_wkt_point).apply(pd.Series)
            xy.columns = ["x", "y"]
            gdf = pd.concat([gdf, xy], axis=1)
            gdf["x_r"] = gdf["x"].round(6)
            gdf["y_r"] = gdf["y"].round(6)

            # Collapse GI* values per residue
            if collapse == "mean":
                collapsed = (
                    gdf.groupby(["x_r", "y_r"])["gi_sum"]
                    .mean()
                    .reset_index()
                    .rename(columns={"gi_sum": "gi_sum_collapsed"})
                )
            else:
                collapsed = (
                    gdf.groupby(["x_r", "y_r"])["gi_sum"]
                    .max()
                    .reset_index()
                    .rename(columns={"gi_sum": "gi_sum_collapsed"})
                )

            merged = pd.merge(df, collapsed, on=["x_r", "y_r"], how="left")
            merged["gi_sum"] = merged["gi_sum_collapsed"].fillna(0.0).astype(float)

            gi_vals = merged["gi_sum"].fillna(0.0).astype(float)
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
            n_clusters = df["cluster"].nunique()
            cmap_clusters = make_cluster_cmap(n_clusters)

            cmap_clusters_plot = ListedColormap(list(cmap_clusters.colors))
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

            sm = plt.cm.ScalarMappable(
                cmap=cmap_clusters,
                norm=plt.Normalize(vmin=0, vmax=n_clusters - 1)
            )
            cbar = plt.colorbar(sm, ax=ax, fraction=0.046, pad=0.04,
                                ticks=np.arange(n_clusters) + 0.5)
            cbar.ax.set_yticklabels([])
            cbar.set_label("Clusters")

            colors = cmap_clusters(df["cluster"].to_numpy())
            ax.scatter(df["x"], df["y"], c=colors, s=150,
                    edgecolors="black", linewidths=0.2, alpha=0.95, zorder=3)

        else:
            # --- Pathway-specific ---
            merged["cluster"] = merged["cluster"].astype(int)
            if collapse == "mean":
                cluster_scores = merged.groupby("cluster")["gi_sum"].mean()
            else:
                cluster_scores = merged.groupby("cluster")["gi_sum"].max()

            Zi_gi_cluster = np.zeros_like(Zi_cluster, dtype=float)
            for clust, score in cluster_scores.items():
                Zi_gi_cluster[Zi_cluster == clust] = score

            cmap_redgreen = plt.cm.RdYlGn_r
            vmin_global, vmax_global = get_gi_global_range(gene)

            # Optional: clamp or pad range a bit for visual balance
            if vmin_global == vmax_global:
                vmin_global, vmax_global = 0, max(1.0, vmax_global)
            else:
                # symmetric normalization around zero
                if vmin_global < 0 < vmax_global:
                    vmax_global = max(abs(vmin_global), abs(vmax_global))
                    vmin_global = -vmax_global

            norm = plt.Normalize(vmin=vmin_global, vmax=vmax_global)


            Zi_gi_masked = np.ma.array(Zi_gi_cluster, mask=outer_mask)
            im = ax.imshow(Zi_gi_masked, origin="lower",
                        extent=(xmn_pad, xmx_pad, ymn_pad, ymx_pad),
                        cmap=cmap_redgreen, norm=norm, alpha=0.6,
                        interpolation="nearest", zorder=1)

            ax.contour(Xi, Yi, Zi_cluster_masked, levels=np.unique(df["cluster"]),
                    colors="black", linewidths=1.2, alpha=0.9, zorder=4)

            ax.scatter(merged["x"], merged["y"], s=150,
                    edgecolors="darkgrey", facecolors="none", linewidths=0, zorder=3)

            cb = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            cb.set_label(f"Cluster GI* ({collapse})\nGreen = Low, Red = High")

        # ---------- Altitude + Border ----------
        ax.contour(Xi, Yi, Zi_alt_masked, levels=40,
                colors="darkgrey", alpha=0, linewidths=0.5, zorder=5)

        ax.contour(Xi, Yi, inside_mask, levels=[0.5],
                colors="black", linewidths=2.5, zorder=6)

        # ---------- Cluster Annotations ----------
        try:
            ann_path = DATA_DIR / "annotated_clusters.csv"
            if ann_path.exists():
                ann = pd.read_csv(ann_path)
                # filter to gene
                ann_sub = ann[ann["gene"].str.upper() == gene.upper()]

                if not ann_sub.empty:
                    ann_sub["cluster"] = ann_sub["cluster"].map(mapping)
                    ann_sub = ann_sub.dropna(subset=["cluster"])
                    ann_sub["cluster"] = ann_sub["cluster"].astype(int)
                    # Compute centroids for each cluster
                    centroids = df.groupby("cluster")[["x", "y"]].mean()
                    ann_sub["cluster"] = pd.to_numeric(ann_sub["cluster"], errors="coerce").astype("Int64")
                    df["cluster"] = pd.to_numeric(df["cluster"], errors="coerce").astype("Int64")

                    for _, row in ann_sub.iterrows():
                        clust = row["cluster"]
                        label = str(row["annotation_type"])
                        if clust in centroids.index:
                            sub_points = df[df["cluster"] == clust]
                            if len(sub_points) < 20:
                                cx, cy = sub_points[["x", "y"]].median()
                            else:
                                cx, cy = centroids.loc[clust]

                            cx_true, cy_true = cx, cy

                            # Push labels outside if near edge
                            margin_x = 0.03 * (xmx - xmn)
                            margin_y = 0.03 * (ymx - ymn)
                            moved = False
                            if cx <= xmn + margin_x:
                                cx = xmn_pad - 0.05 * (xmx - xmn); moved = True
                            if cx >= xmx - margin_x:
                                cx = xmx_pad + 0.05 * (xmx - xmn); moved = True
                            if cy <= ymn + margin_y:
                                cy = ymn_pad - 0.05 * (ymx - ymn); moved = True
                            if cy >= ymx - margin_y:
                                cy = ymx_pad + 0.05 * (ymx - ymn); moved = True

                            if moved:
                                ax.plot([cx_true, cx], [cy_true, cy],
                                        color="black", linewidth=0.8, zorder=998)

                            ax.text(
                                cx, cy, label,
                                ha="center", va="center",
                                fontsize=10, fontweight="bold",
                                color="white",
                                path_effects=[
                                    patheffects.Stroke(linewidth=2, foreground="black"),
                                    patheffects.Normal()
                                ],
                                clip_on=False,
                                zorder=999
                            )

            ax.set_xlim(xmn_pad - 0.1*(xmx-xmn), xmx_pad + 0.1*(xmx-xmn))
            ax.set_ylim(ymn_pad - 0.1*(ymx-ymn), ymx_pad + 0.1*(ymx-ymn))

        except Exception as e:
            print("[flatmap_image][WARN] Could not add annotations:", e)



        # ------------------------------------------------------------------
        fig.tight_layout(pad=0)

        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=170, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="image/png",
            headers={"Cache-Control": "no-store"}
        )

@app.get("/flatmap/summary")
def flatmap_summary(gene: str, pathway: str | None = None):
    """
    Return dynamic summary sentences for Panel 2.
    - Default: report mutation + cell line counts (from The Cancer Dependency Map) + cluster count.
    - Pathway-specific: describe TRN association + top cluster description.
    """
    try:
        # --- Load mutation + cell line counts ---
        mut_csv = Path("mutation_counts.csv")
        n_mut, n_cell = None, None
        if mut_csv.exists():
            mdf = pd.read_csv(mut_csv)
            # expect columns: gene, mut_count, cell_line_count
            if {"gene", "mut_count", "cell_line_count"}.issubset(mdf.columns):
                row = mdf[mdf["gene"].str.upper() == gene.upper()]
                if not row.empty:
                    n_mut = int(row.iloc[0]["mut_count"])
                    n_cell = int(row.iloc[0]["cell_line_count"])

        # --- Load cluster info (from NMF data) ---
        nmf, mapping = load_nmf(gene)
        n_clusters = nmf["cluster"].nunique()

        # --- Default summary sentence ---
        if not pathway:
            s = (
                f"{gene.upper()} has {n_mut if n_mut is not None else 'multiple'} mutations "
                f"across {n_cell if n_cell is not None else 'several'} cell lines "
                f"from The Cancer Dependency Map. "
                f"Shown here is a flatmap of {gene.upper()} split into {n_clusters} "
                f"regions of functional interest (RFIs)."
            )
            return {"summary": s}

        # --- Pathway-specific summary sentence ---
        df_all = load_gene_parquet(gene)
        gdf = df_all[
            (df_all["table"] == "gdf") &
            (df_all["pathway"].str.upper() == pathway.upper())
        ].copy()

        if gdf.empty:
            return {
                "summary": (
                    f"This flatmap of {gene.upper()} is colored by association to {pathway.upper()}, "
                    "but no GI* data were found for this TRN."
                )
            }

        # --- Identify cluster with highest GI* association ---
        if "x" not in gdf.columns or "y" not in gdf.columns:
            xy = gdf["geometry"].apply(parse_wkt_point).apply(pd.Series)
            xy.columns = ["x", "y"]
            gdf = pd.concat([gdf, xy], axis=1)

        # Round coordinates to align NMF and GDF
        gdf["x_r"] = gdf["x"].round(6)
        gdf["y_r"] = gdf["y"].round(6)
        nmf["x_r"] = nmf["x"].round(6)
        nmf["y_r"] = nmf["y"].round(6)

        # Collapse GI* per residue (match /flatmap/image)
        collapsed = (
            gdf.groupby(["x_r", "y_r"])["gi_sum"]
            .max()
            .reset_index()
            .rename(columns={"gi_sum": "gi_sum_collapsed"})
        )

        merged = pd.merge(nmf, collapsed, on=["x_r", "y_r"], how="left")
        merged["gi_sum"] = merged["gi_sum_collapsed"].fillna(0.0).astype(float)

        # Compute per-cluster GI* stats
        cluster_gi = merged.groupby("cluster")["gi_sum"].max().fillna(0)
        top_cluster = cluster_gi.idxmax() if not cluster_gi.empty else None
        top_score = cluster_gi.max().round(3) if not cluster_gi.empty else None  # 🆕 add score

        # Lookup annotation label for that cluster
        desc = None
        ann_path = DATA_DIR / "annotated_clusters.csv"
        if ann_path.exists():
            ann = pd.read_csv(ann_path)
            ann_sub = ann[ann["gene"].str.upper() == gene.upper()]
            if not ann_sub.empty and "cluster" in ann_sub.columns:
                ann_sub["cluster"] = ann_sub["cluster"].map(mapping)
                if top_cluster in ann_sub["cluster"].values:
                    desc = ann_sub.loc[
                        ann_sub["cluster"] == top_cluster, "annotation_type"
                    ].iloc[0]

        if not desc:
            desc = f"cluster {top_cluster}"

        # 🆕 Include GI* score in sentence
        if top_score is not None:
            s = (
                f"This flatmap of {gene.upper()} is colored by association to {pathway.upper()}. "
                f"The '{desc}' region of functional interest (RFI) shows the strongest association "
                f"with this TRN, with a GI* score of {top_score}."
            )
        else:
            s = (
                f"This flatmap of {gene.upper()} is colored by association to {pathway.upper()}. "
                f"The '{desc}' region of functional interest (RFI) shows the strongest association "
                f"with this TRN."
            )

        return {"summary": s}

    except Exception as e:
        return {"error": str(e)}



# =========================================================
# ========= PANEL 3: /empirical (matplotlib) ======
# =========================================================
# Path to your calibration CSV
# Directory containing A.parquet, B.parquet, etc.
PARQUET_DIR = Path("data/Parquet_letter_concat")


def load_gene_data(gene: str) -> pd.DataFrame:
    """Load Parquet file for the gene's first letter and filter for the gene."""
    letter = gene[0].upper()
    file_path = PARQUET_DIR / f"{letter}.parquet"

    if not file_path.exists():
        raise FileNotFoundError(f"Missing Parquet file for letter {letter}")

    df = pd.read_parquet(file_path)
    sub = df[df["gene"].str.upper() == gene.upper()]
    sub['confidence'] = sub['confidence']*10
    sub = sub.sort_values("confidence", ascending=False).reset_index(drop=True)
    sub["adjusted_rank"] = range(1, len(sub) + 1)
    return sub


# ====== /calibration/image ======
@app.get("/calibration/image")
def calibration_image(gene: str):
    """
    Returns a matplotlib plot (PNG) of adjusted_rank vs confidence
    for the given gene, highlighting the top 10% region.
    If no data exist, returns a JSON message instead of an image.
    """
    with PLOT_LOCK:
        try:
            sub = load_gene_data(gene)

            # ✅ If gene data missing or empty, return JSON response
            if sub is None or sub.empty:
                return JSONResponse(
                    {
                        "error": "There is no single cell perturbation (Perturb-seq) data for this protein."
                    },
                    status_code=404,
                )

            # --- Create the calibration plot ---
            fig, ax = plt.subplots(figsize=(6, 4))
            ax.plot(
                sub["adjusted_rank"],
                sub["confidence"],
                marker="o",
                linestyle="-",
                linewidth=1.5,
                alpha=0.8,
            )

            ax.set_xlabel("Rank of TRNs (predicted using AI)")
            ax.set_xticks([])
            ax.set_xticklabels([])
            ax.set_ylabel(
                f"Confidence of association between\n{gene} and each TRN\n(validated by Perturb-seq)",
                fontsize=10,
                labelpad=8,
                wrap=True,
            )
            ax.grid(False)

            # === Highlight only the top-left 10% region ===
            if not sub["adjusted_rank"].empty and not sub["confidence"].empty:
                x_thresh = sub["adjusted_rank"].quantile(0.1)
                y_thresh = sub["confidence"].quantile(0.9)
                width = abs(x_thresh - sub["adjusted_rank"].min())

                ax.add_patch(
                    plt.Rectangle(
                        (sub["adjusted_rank"].min(), y_thresh),
                        width,
                        sub["confidence"].max() - y_thresh,
                        facecolor="lightgreen",
                        alpha=0.3,
                        edgecolor="green",
                        linewidth=1.5,
                        linestyle="--",
                    )
                )

            # --- Save to PNG buffer ---
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight")
            plt.close(fig)
            buf.seek(0)

            return StreamingResponse(
                buf,
                media_type="image/png",
                headers={
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        except FileNotFoundError:
            return JSONResponse(
                {
                    "error": "There is no single cell perturbation (Perturb-seq) data for this protein."
                },
                status_code=404,
            )
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)




# ====== /calibration/genes ======
@app.get("/calibration/genes")
def calibration_genes(gene: str):
    """
    Returns list of pathway–confidence pairs for the given gene.
    Used for dropdown options.
    """
    try:
        sub = load_gene_data(gene)
        if sub.empty:
            return {"genes": []}

        if not {"pathway", "confidence"}.issubset(sub.columns):
            return {"error": "Parquet files must include columns: pathway, confidence"}

        grouped = (
            sub.groupby("pathway")["confidence"]
            .max()
            .reset_index()
            .sort_values("confidence", ascending=False)
        )

        return {
            "genes": [
                {"gene": row["pathway"], "confidence": float(row["confidence"])}
                for _, row in grouped.iterrows()
            ]
        }

    except FileNotFoundError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}
    
# ====== /calibration/summary ======
@app.get("/calibration/summary")
def calibration_summary(gene: str):
    """
    Return a short descriptive summary for Panel 3 (calibration plot):
    "[gene] has [x] mutations across [y] cell lines... [z] RFIs..."
    """
    try:
        # --- Load mutation + cell line counts ---
        mut_csv = Path("mutation_counts.csv")
        n_mut, n_cell = None, None
        if mut_csv.exists():
            mdf = pd.read_csv(mut_csv)
            if {"gene", "mut_count", "cell_line_count"}.issubset(mdf.columns):
                row = mdf[mdf["gene"].str.upper() == gene.upper()]
                if not row.empty:
                    n_mut = int(row.iloc[0]["mut_count"])
                    n_cell = int(row.iloc[0]["cell_line_count"])

        # --- Load NMF / cluster info ---
        nmf, _ = load_nmf(gene)
        n_clusters = nmf["cluster"].nunique()

        # --- Construct summary sentence ---
        s = (
            f"{gene.upper()} has {n_mut if n_mut is not None else 'multiple'} mutations "
            f"across {n_cell if n_cell is not None else 'several'} cell lines from "
            f"The Cancer Dependency Map. {gene.upper()} can be divided into {n_clusters} "
            f"regions of functional interest (RFIs). TRNs with the strongest associations "
            f"to {gene.upper()} are highlighted in the green quadrant. "
            f"These associations have been predicted by AI, and validated with experimental "
            f"single-cell Perturb-seq data."
        )
        return {"summary": s}

    except Exception as e:
        return {"error": str(e)}



# =========================================================
# =============== PANEL 1: structures endpoint ============
# =========================================================

@app.get("/structures")
def get_structures(gene: str):
    """
    Returns available structure sources for a given gene.
    Always includes AlphaFold (default).
    Optionally includes PDB IDs if gene_to_pdb.csv is present.
    """
    try:
        default = "alphafold"
        pdb_ids: list[str] = []

        csv_path = Path("data/gene_to_pdb.csv")
        if csv_path.exists():
            df = pd.read_csv(csv_path)
            # normalize colnames
            cols = [c.lower().strip() for c in df.columns]
            if "gene" in cols and "pdb_id" in cols:
                gcol, pcol = cols.index("gene"), cols.index("pdb_id")
                # select rows for this gene (case-insensitive)
                sub = df[df.iloc[:, gcol].str.upper() == gene.upper()]
                pdb_ids = [str(x).strip() for x in sub.iloc[:, pcol] if pd.notna(x)]

        return {"default": default, "pdb_ids": pdb_ids}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to load structures for {gene}: {e}"}
        )

N_BUCKETS = 500

def stable_bucket(g: str, n_buckets: int = N_BUCKETS) -> int:
    h = hashlib.md5(g.encode("utf-8")).hexdigest()
    return int(h, 16) % n_buckets

@app.get("/residues")
def get_residues(gene: str):
    """Return only residue-cluster mapping (for coloring structures)."""
    bucket = stable_bucket(gene)
    path = Path(f"gene_buckets/bucket_{bucket:04d}.parquet")
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No bucket file for {gene}")
    df = pd.read_parquet(path)

    df = df.rename(columns={"clust": "cluster", "res": "residue"})
    df = df[df["gene"].str.upper() == gene.upper()].copy()

    # ✅ Normalize residues and clusters as ints
    df["residue"] = pd.to_numeric(df["residue"], errors="coerce")
    df["cluster"] = pd.to_numeric(df["cluster"], errors="coerce")

    df = df.dropna(subset=["residue", "cluster"])
    df["residue"] = df["residue"].astype(int)
    df["cluster"] = df["cluster"].astype(int)

    subset = df[["gene", "residue", "cluster"]].drop_duplicates()
    return subset.to_dict(orient="records")


@app.get("/residues_with_pathways")
def get_residues_with_pathways(gene: str):
    """Return full residue-cluster-pathway-score mapping (for pathway table)."""
    bucket = stable_bucket(gene)
    path = Path(f"gene_buckets/bucket_{bucket:04d}.parquet")
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No bucket file for {gene}")
    df = pd.read_parquet(path)

    df = df.rename(columns={"clust": "cluster", "res": "residue"})
    df = df[df["gene"].str.upper() == gene.upper()].copy()

    # ✅ Normalize types
    df["residue"] = pd.to_numeric(df["residue"], errors="coerce")
    df["cluster"] = pd.to_numeric(df["cluster"], errors="coerce")
    df["score"] = pd.to_numeric(df["score"], errors="coerce")

    df = df.dropna(subset=["residue", "cluster"])
    df["residue"] = df["residue"].astype(int)
    df["cluster"] = df["cluster"].astype(int)

    return df.to_dict(orient="records")


@app.get("/trn_by_cluster_or_residue")
def trn_by_cluster_or_residue(gene: str, cluster: int | None = None, residue: int | None = None, collapse: str = "max"):
    """Return top-500 TRNs aggregated by cluster or residue (fast single parquet read)."""
    df_all = load_gene_parquet(gene)
    gdf = df_all[df_all["table"] == "gdf"].copy()
    nmf, mapping = load_nmf(gene, df_all)

    # parse geometry if needed
    if "geometry" in gdf.columns and ("x" not in gdf.columns or "y" not in gdf.columns):
        coords = gdf["geometry"].str.extract(r"POINT\s*\(?\s*([-0-9\.Ee+]+)\s+([-0-9\.Ee+]+)\s*\)?", expand=True)
        coords.columns = ["x", "y"]
        coords = coords.astype(float)
        gdf = pd.concat([gdf, coords], axis=1)

    gdf["x_r"], gdf["y_r"] = gdf["x"].round(6), gdf["y"].round(6)
    nmf["x_r"], nmf["y_r"] = nmf["x"].round(6), nmf["y"].round(6)
    merged = pd.merge(gdf, nmf[["x_r", "y_r", "cluster"]], on=["x_r", "y_r"], how="left")

    if cluster is not None:
        merged = merged[merged["cluster"] == cluster]
    elif residue is not None and "residue" in merged.columns:
        merged = merged[merged["residue"] == residue]

    if merged.empty:
        raise HTTPException(status_code=404, detail="No matching points.")

    agg = merged.groupby("pathway")["gi_sum"]
    trn_scores = (agg.mean() if collapse == "mean" else agg.max()).reset_index()
    trn_scores = trn_scores.rename(columns={"gi_sum": "score"}).sort_values("score", ascending=False)

    return {
        "gene": gene.upper(),
        "n_trns": len(trn_scores),
        "aggregation": collapse,
        "cluster": cluster,
        "residue": residue,
        "pathways": trn_scores.head(500).to_dict(orient="records"),
    }


# =========================================================
# =============== PATHWAY ENDPOINT ========================
# =========================================================

# Load once at startup
PATHWAY_MATRIX = pd.read_csv("all_proteins_max_score_matrix_cleaned.csv", index_col=0)

def gene_in_master_matrix(gene: str) -> bool:
    """Check if the given gene exists in the main all_proteins_max_score_matrix_cleaned.csv index."""
    g = gene.strip().upper()
    return g in [x.strip().upper() for x in PATHWAY_MATRIX.index]



@app.get("/pathway/proteins")
def pathway_proteins(pathway: str, threshold: float = 0.1):
    """
    Return all proteins associated with a pathway above a score threshold.
    """
    try:
        if pathway not in PATHWAY_MATRIX.columns:
            return {"error": f"Pathway '{pathway}' not found."}

        col = PATHWAY_MATRIX[pathway]
        sel = col[col > threshold].sort_values(ascending=False)

        return {
            "pathway": pathway,
            "threshold": threshold,
            "proteins": sel.index.tolist(),
            "scores": sel.tolist()
        }
    except Exception as e:
        return {"error": str(e)}


import os
import requests

GENESET_DIR = Path("geneset_files")

def chunk_list(lst, size):
    """Yield successive chunks from list of given size."""
    for i in range(0, len(lst), size):
        yield lst[i:i + size]

@app.get("/stringdb/pathway_interactions")
def stringdb_pathway_interactions(pathway: str, threshold: float = 0.5, species: int = 9606):
    """
    Check STRING interactions between:
      - proteins above threshold for this pathway (prediction set)
      - proteins in the gene set, PLUS the TRN itself (NRF2 → NFE2L2)
    """
    try:
        # 1. Get predicted proteins above threshold
        if pathway not in PATHWAY_MATRIX.columns:
            return {"error": f"Pathway '{pathway}' not found."}

        col = PATHWAY_MATRIX[pathway]
        threshold_proteins = col[col > threshold].index.tolist()
        if not threshold_proteins:
            return {"interactions": []}

        # 2. Load gene set proteins
        geneset_file = GENESET_DIR / f"{pathway}_geneset.csv"
        if not geneset_file.exists():
            return {"error": f"Geneset file not found for pathway '{pathway}'"}

        geneset_df = pd.read_csv(geneset_file)
        geneset_proteins = geneset_df.iloc[:, 0].dropna().astype(str).tolist()

        # 3. Define TRN mapping: NRF2 → NFE2L2, else use the pathway name
        trn_name = "NFE2L2" if pathway.strip().upper() == "NRF2" else pathway.strip().upper()

        # 4. Add the TRN itself to the "gene set" group
        if trn_name not in [x.upper() for x in geneset_proteins]:
            geneset_proteins.append(trn_name)

        # 5. Combine all for STRING query
        query_proteins = list(set(threshold_proteins) | set(geneset_proteins))

        STRING_API_URL = "https://string-db.org/api/json/network"
        all_data = []

        for chunk in chunk_list(query_proteins, 100):
            identifiers = "%0d".join(chunk)
            params = {
                "identifiers": identifiers,
                "species": species,
                "caller_identity": "starmap_backend",
            }
            r = requests.get(STRING_API_URL, params=params)
            r.raise_for_status()
            all_data.extend(r.json())

        # 6. Filter to keep only interactions between predicted ↔ (gene set ∪ TRN)
        upper_preds = [x.upper() for x in threshold_proteins]
        upper_geneset = [x.upper() for x in geneset_proteins]

        interactions = []
        for d in all_data:
            a, b = d["preferredName_A"].upper(), d["preferredName_B"].upper()

            # predicted ↔ gene set (including TRN)
            if (a in upper_preds and b in upper_geneset):
                interactions.append({
                    "prediction_protein": a,
                    "geneset_protein": b,
                    "score": d["score"],
                })
            elif (b in upper_preds and a in upper_geneset):
                interactions.append({
                    "prediction_protein": b,
                    "geneset_protein": a,
                    "score": d["score"],
                })

        return {"interactions": interactions}

    except Exception as e:
        return {"error": str(e)}


from io import StringIO

@app.get("/pathway/description")
def pathway_description(pathway: str):
    try:
        # Handle NRF2 separately
        if pathway.upper() == "NRF2":
            url = "https://www.gsea-msigdb.org/gsea/msigdb/human/download_geneset.jsp?geneSetName=SINGH_NFE2L2_TARGETS&fileType=TSV"
        else:
            url = f"https://www.gsea-msigdb.org/gsea/msigdb/human/download_geneset.jsp?geneSetName={pathway.upper()}_TARGET_GENES&fileType=TSV"

        r = requests.get(url, timeout=10)
        r.raise_for_status()

        # Load TSV into dataframe
        df = pd.read_csv(io.StringIO(r.text), sep="\t")

        # Convert first two columns (key, value) into dictionary
        if df.shape[1] >= 2:
            meta = pd.Series(df.iloc[:, 1].values, index=df.iloc[:, 0]).to_dict()
        else:
            return {"error": f"Unexpected TSV format for {pathway}"}

        desc = meta.get("DESCRIPTION_BRIEF")
        pubmed = meta.get("PMID")
        authors = meta.get("AUTHORS")

        return {
            "pathway": pathway.upper(),
            "description": desc,
            "pubmed": pubmed,
            "authors": authors,
        }

    except Exception as e:
        return {"error": f"Could not fetch description for {pathway}: {e}"}


# =========================================================
# ========= PANEL 4: Drug–Expression plot (Tahoe Matrix) ===
# =========================================================

import matplotlib.pyplot as plt
import io
from fastapi.responses import StreamingResponse, Response


@app.get("/confidence/image")
def confidence_image(protein: str):
    """
    Returns logistic fit plot (PNG) for the given protein
    using data from tahoe_confidence_metrics.csv.
    """
    import numpy as np
    from scipy.optimize import curve_fit
    from sklearn.metrics import r2_score

    with PLOT_LOCK:
        try:
            df = pd.read_csv("tahoe_confidence_metrics.csv")
            emp = df[df["protein"].str.upper() == protein.upper()].copy()
            if emp.empty:
                return JSONResponse(
                    {"error": f"No confidence data found for {protein}"},
                    status_code=404,
                )

            # ensure numeric
            emp = emp.reset_index(drop=True)
            if "index" not in emp.columns:
                emp = emp.reset_index(names="index")
            emp["norm_confidence"] = pd.to_numeric(
                emp["norm_confidence"], errors="coerce"
            ).fillna(0)

            x = emp["index"].values
            y = emp["norm_confidence"].values
            x0, y0 = x[0], y[0]

            # logistic function constrained to first point
            def logistic_fixed_first(x, k, xmid, c):
                L = (y0 - c) * (1 + np.exp(k * (x0 - xmid)))
                return c + L / (1 + np.exp(k * (x - xmid)))

            p0 = [-0.05, np.median(x), min(y)]
            popt, _ = curve_fit(logistic_fixed_first, x, y, p0=p0, maxfev=10000)
            k, xmid, c = popt
            y_pred = logistic_fixed_first(x, *popt)
            r2 = r2_score(y, y_pred)

            # equation label
            eq_label = (
                "Logistic fit:\n"
                r"$y = c + \frac{L}{1 + e^{k(x - x_{mid})}}$" "\n"
                f"$k={k:.3f},\, x_{{mid}}={xmid:.2f},\, c={c:.3f}$\n"
                f"$R^2={r2:.3f}$"
            )

            # plot
            fig, ax = plt.subplots(figsize=(6, 4))
            ax.scatter(x, y, s=30, alpha=0.7, label="Data")
            x_sorted = np.sort(x)
            ax.plot(x_sorted, logistic_fixed_first(x_sorted, *popt),
                    color="red", label=eq_label)
            ax.set_xlabel("Rank of drugs (AI predicted)")
            ax.set_ylabel(f"Confidence of association (0-1) between\n{protein} and each drug\n(validated by Tahoe-100M)")
            ax.set_title(protein.upper())
            ax.legend(loc="upper right", fontsize=9)
            ax.grid(False)

            buf = io.BytesIO()
            fig.tight_layout()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=160)
            plt.close(fig)
            buf.seek(0)

            return StreamingResponse(
                buf,
                media_type="image/png",
                headers={"Cache-Control": "no-store"},
            )

        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)
        

@app.get("/confidence/rankings")
def confidence_rankings(protein: str):
    """
    Return ranked drugs for a given protein from drug_rankings.csv.
    """
    try:
        df = pd.read_csv("drug_rankings.csv")
        sub = df[df["protein"].str.upper() == protein.upper()]
        if sub.empty:
            return {"rankings": []}

        # expected columns: norm_drug, score (or similar)
        cols = [c.lower() for c in sub.columns]
        drug_col = "norm_drug" if "norm_drug" in cols else sub.columns[0]
        score_col = "index" if "index" in cols else sub.columns[-1]

        sub = sub.sort_values(score_col, ascending=False)
        rankings = [
            {"drug": row[drug_col]}
            for _, row in sub.iterrows()
        ]
        return {"rankings": rankings}

    except Exception as e:
        return {"error": str(e)}


# =========================================================
# ========= DRUG PAGE PANEL 4: Protein–Expression plot =====
# =========================================================

@app.get("/drug_expression/image")
def drug_expression_image(drug: str):
    """
    Return bar plot of protein expression values for a given drug.
    """
    with PLOT_LOCK:
        try:
            if drug not in TAHOE_MATRIX.columns:
                # Case-insensitive match
                matches = [c for c in TAHOE_MATRIX.columns if c.lower() == drug.lower()]
                if not matches:
                    return Response(status_code=404)
                drug = matches[0]

            col = TAHOE_MATRIX[drug]
            sorted_col = col.sort_values(ascending=False)

            fig, ax = plt.subplots(figsize=(8, 4))
            ax.bar(sorted_col.index, sorted_col.values, color="#77A9D8")
            ax.set_ylabel("Avg expression (pseudobulk from Tahoe-100M)")
            ax.xaxis.set_visible(False)

            buf = io.BytesIO()
            fig.tight_layout()
            fig.savefig(buf, format="png", bbox_inches="tight")
            plt.close(fig)
            buf.seek(0)

            return StreamingResponse(
                buf,
                media_type="image/png",
                headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"},
            )

        except Exception as e:
            return {"error": str(e)}



# =========================================================
# =============== DOWNLOADS ENDPOINT ======================
# =========================================================

from fastapi.responses import FileResponse

DOWNLOADABLES = {
    "all_proteins_max_score_matrix_cleaned.csv": "Protein–Pathway association scores (max scores per protein–pathway)",
    "calibration.csv": "Calibration curves for computational ranking confidence",
    "cleaned_mappings_2.csv": "Gene metadata and aliases used for protein lookup",
    "gene_to_pdb.csv": "Protein ↔ PDB mapping for structure visualization",
    "llm_group_labels.csv": "Functional groups assigned to TFs by language model curation",
    "tf_function_labels_10groups.csv": "10-group functional categorization of transcription factor pathways",
    "annotated_clusters.csv": "Annotated NMF clusters per gene (structure-space regions)",
    "residue-pathway-score.csv": "Residue-level association scores with pathways",
    "data/gsea_gdf_files.zip": "All GSEA pathway results (*.gdf.csv) bundled into a ZIP archive",
}

@app.get("/downloads/list")
def list_downloads():
    """List all downloadable files with descriptions."""
    return [
        {"filename": fname, "description": desc}
        for fname, desc in DOWNLOADABLES.items()
    ]

@app.get("/downloads/get/{filename}")
def get_download(filename: str):
    """Serve a file for download if it exists in DOWNLOADABLES."""
    if filename not in DOWNLOADABLES:
        raise HTTPException(status_code=404, detail="File not found.")

    fpath = Path(filename)
    if not fpath.exists():
        # If relative path, resolve from backend folder
        fpath = Path(__file__).resolve().parent / filename

    if not fpath.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} missing on server.")

    return FileResponse(path=fpath, filename=fpath.name, media_type="application/octet-stream")


# ===========================
# /mave/data endpoint
# ===========================
import pandas as pd
from fastapi import HTTPException

MAVE_PATH = Path("data/processed_mave.csv")

@app.get("/mave/data")
def get_mave_data(gene: str):
    """
    Return MAVE average scores for a given gene as JSON.
    """
    try:
        if not MAVE_PATH.exists():
            raise HTTPException(status_code=404, detail="MAVE file not found")

        df = pd.read_csv(MAVE_PATH)
        sub = df[df["ID"].str.upper() == gene.upper()].copy()
        if sub.empty:
            raise HTTPException(status_code=404, detail=f"No MAVE data found for {gene}")

        sub = sub[["from", "to", "position", "score"]].copy()

        # Ensure position is integer and drop NaNs
        sub["position"] = sub["position"].fillna(0).astype(int)
        sub = sub.dropna(subset=["from", "to", "score"])

        return sub.to_dict(orient="records")

    except Exception as e:
        print(f"[ERROR] /mave/data failed for {gene}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load MAVE data: {e}")


# ====== /clusters/colors ======
@app.get("/clusters/colors")
def get_cluster_colors(gene: str):
    """
    Return mapping of residue position → hex color for the given gene.
    Colors correspond to the cluster each residue belongs to.
    """
    try:
        # --- Load residue-cluster mappings (from gene_buckets) ---
        bucket = stable_bucket(gene)
        path = Path(f"gene_buckets/bucket_{bucket:04d}.parquet")
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"No bucket file for {gene}")
        df = pd.read_parquet(path)

        df = df.rename(columns={"clust": "cluster", "res": "residue"})
        df = df[df["gene"].str.upper() == gene.upper()].copy()

        # Clean types
        df["residue"] = pd.to_numeric(df["residue"], errors="coerce")
        df["cluster"] = pd.to_numeric(df["cluster"], errors="coerce")
        df = df.dropna(subset=["residue", "cluster"])
        df["residue"] = df["residue"].astype(int)
        df["cluster"] = df["cluster"].astype(int)

        # --- Assign cluster colors ---
        n_clusters = df["cluster"].nunique()
        cmap = make_cluster_cmap(n_clusters)
        hex_colors = [matplotlib.colors.rgb2hex(c) for c in cmap.colors]

        # Build mapping: residue → color
        color_map = {
            str(int(res)): hex_colors[int(cluster) % len(hex_colors)]
            for res, cluster in zip(df["residue"], df["cluster"])
        }

        return color_map

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build residue color map for {gene}: {e}")

@app.get("/mave/legend")
def mave_legend(gene: str):
    """
    Return mapping of cluster color -> RFI annotation label for legend display.
    """
    try:
        ann_path = Path("data/annotated_clusters.csv")
        if not ann_path.exists():
            raise HTTPException(status_code=404, detail="No annotation file found")

        ann = pd.read_csv(ann_path)
        ann_sub = ann[ann["gene"].str.upper() == gene.upper()]
        if ann_sub.empty:
            return {}

        # Normalize cluster numbers using same mapping as NMF
        nmf, mapping = load_nmf(gene)
        ann_sub["cluster"] = ann_sub["cluster"].map(mapping)
        ann_sub = ann_sub.dropna(subset=["cluster", "annotation_type"])
        ann_sub["cluster"] = ann_sub["cluster"].astype(int)

        # Assign colors from BASE_COLORS
        legend_map = {}
        for _, row in ann_sub.iterrows():
            clust = row["cluster"]
            color = BASE_COLORS[clust % len(BASE_COLORS)]
            label = str(row["annotation_type"])
            legend_map[color] = label

        return legend_map

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build MAVE legend: {e}")
# =========================================================
# ========== AUTOCOMPLETE ENDPOINTS (for homepage) =========
# =========================================================

@app.get("/proteins/list")
def proteins_list():
    """
    Return a sorted list of all protein IDs available in the embeddings dataset.
    Used for homepage autocomplete.
    """
    try:
        if _VECS_DF.empty:
            return {"proteins": []}
        proteins = sorted(_VECS_DF.index.unique().tolist())
        return {"proteins": proteins}
    except Exception as e:
        return {"error": str(e)}


@app.get("/pathways/list")
def pathways_list():
    """
    Return a sorted list of all pathway/TRN names available in the master matrix.
    Used for homepage autocomplete.
    """
    try:
        if PATHWAY_MATRIX.empty:
            return {"pathways": []}
        pathways = sorted(PATHWAY_MATRIX.columns.tolist())
        return {"pathways": pathways}
    except Exception as e:
        return {"error": str(e)}
