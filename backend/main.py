import os

os.environ["HF_HOME"] = "/tmp/starmap_hf"
os.environ["HF_HUB_CACHE"] = "/tmp/starmap_hf/hub"
os.environ["HF_XET_CACHE"] = "/tmp/starmap_hf/xet"
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib_cache"

for folder in [
    os.environ["HF_HOME"],
    os.environ["HF_HUB_CACHE"],
    os.environ["HF_XET_CACHE"],
    os.environ["MPLCONFIGDIR"],
]:
    os.makedirs(folder, exist_ok=True)

# backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse, Response, FileResponse
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


# Public, versioned website dataset. No authentication token is sent.
from functools import lru_cache
SITE_REPO = "kritishukla/starmap-site-data"
SITE_REVISION = "6ed16990ac837cb0d7b8c6dc1c9eb782451dee79"

@lru_cache(maxsize=128)
def site_file(filename: str) -> str:
    try:
        return hf_hub_download(repo_id=SITE_REPO, repo_type="dataset",
                               revision=SITE_REVISION, filename=filename, token=False,
                               cache_dir=os.environ.get("STARMAP_CACHE_DIR", "/tmp/starmap_hf"))
    except Exception as exc:
        if getattr(getattr(exc, "response", None), "status_code", None) == 404:
            raise HTTPException(status_code=404, detail=f"Dataset file missing: {filename}") from exc
        raise

def canonical_gene(gene: str) -> str:
    gene = gene.strip().upper()
    if not gene:
        raise HTTPException(status_code=400, detail="Gene must not be empty")
    return gene

@lru_cache(maxsize=1)
def site_genes():
    with open(site_file("valid_flatmap_genes.json")) as handle:
        return frozenset(json.load(handle))

@lru_cache(maxsize=128)
def _site_gene_table(kind: str, gene: str) -> pd.DataFrame:
    letter = gene[0] if gene[0].isalpha() else "OTHER"
    if kind in {"nmf", "scores"} and gene not in site_genes():
        raise HTTPException(status_code=404, detail=f"No website data for {gene}")
    df = pd.read_parquet(site_file(f"{kind}/{letter}.parquet"),
                         filters=[("gene", "==", gene)])
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No {kind} data for {gene}")
    return df

def site_gene_table(kind: str, gene: str) -> pd.DataFrame:
    return _site_gene_table(kind, canonical_gene(gene)).copy()

@lru_cache(maxsize=1)
def site_matrix() -> pd.DataFrame:
    df = pd.read_parquet(site_file("matrices/protein_trn_scores.parquet"))
    df.index = df.index.astype(str).str.strip().str.upper()
    df.columns = df.columns.astype(str).str.strip().str.upper()
    if df.index.duplicated().any() or df.columns.duplicated().any():
        raise RuntimeError("Duplicate names in website score matrix")
    return df.apply(pd.to_numeric, errors="raise")

def cluster_pathway_scores(gene: str, pathway: str) -> pd.DataFrame:
    df = site_gene_table("scores", gene)
    df = df[df["pathway"].eq(pathway.strip().upper())].copy()
    if df.empty:
        raise HTTPException(status_code=404, detail="No scores for this TRN")
    return df.rename(columns={"score": "gi_sum"})[["cluster", "gi_sum"]]

# Panel 5 uses the same release matrix as the TRN rankings.
_VECS_DF = site_matrix().fillna(0.0)
_IDS = _VECS_DF.index.to_numpy()
_V_NORM = _VECS_DF.to_numpy(dtype=np.float32, copy=True)
_V_NORM /= np.linalg.norm(_V_NORM, axis=1, keepdims=True) + 1e-12


def _topk_cosine(query_protein: str, k: int = 10) -> pd.DataFrame:
    if _V_NORM.size == 0 or _VECS_DF.empty:
        raise RuntimeError("Panel 5 score matrix is empty.")

    if query_protein not in _VECS_DF.index:
        raise KeyError(f"{query_protein} not found in vectors index")

    q = _VECS_DF.loc[query_protein].values.astype(np.float32)
    q = q / (np.linalg.norm(q) + 1e-12)        # normalize query once

    sims = _V_NORM @ q
    candidates = np.flatnonzero(_IDS != query_protein)
    k = min(max(1, int(k)), len(candidates))
    order = np.argsort(-sims[candidates], kind="stable")
    topk_idx = candidates[order[:k]]

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
    neighbors = nbrs_df["protein_id"].tolist()
    angles = np.linspace(0, 2 * np.pi, len(neighbors), endpoint=False)
    pos = pd.DataFrame(
        {
            "x": np.r_[0.0, np.cos(angles)],
            "y": np.r_[0.0, np.sin(angles)],
        },
        index=[query, *neighbors],
    )

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
        showlegend=True, 
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=-0.2,          
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
    gene = canonical_gene(gene)
    t0 = time.time()
    try:
        if _V_NORM.size == 0 or _VECS_DF.empty:
            return "[plot_ping] ERROR: Panel 5 score matrix is empty."

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
    gene = canonical_gene(gene)
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
            "plot": json.loads(fig.to_json()),
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
    # Compatibility adapter for the remaining NMF-download code.
    df = site_gene_table("nmf", gene).rename(columns={
        "residue": "res", "cluster": "clust", "x": "x_axis", "y": "y_axis"})
    df["table"] = "nmfinfo"
    return df


def load_scores_csv(gene: str) -> pd.DataFrame:
    return site_gene_table("scores", gene)




def normalize_clusters(series: pd.Series) -> pd.Series:
    """Normalize cluster labels to consecutive ints starting at 0."""
    unique = sorted(series.unique())
    mapping = {old: new for new, old in enumerate(unique)}
    return series.map(mapping), mapping

def load_nmf(gene: str, df: pd.DataFrame | None = None):
    nmf = site_gene_table("nmf", gene)
    nmf["x_r"] = nmf["x"].round(6)
    nmf["y_r"] = nmf["y"].round(6)
    mapping = {int(c): int(c) for c in nmf["cluster"].unique()}
    return nmf, mapping




def list_pathways_for_gene(gene: str) -> list[str]:
    scores = site_gene_table("scores", gene)
    maxima = scores.groupby("pathway")["score"].max()
    return sorted(maxima[maxima > 0].index.tolist())


@lru_cache(maxsize=128)
def load_global_max_scores() -> pd.DataFrame:
    return site_matrix()




# ---------------- Endpoints ----------------


@app.get("/flatmap/pathways")
def flatmap_pathways(gene: str):
    return {"pathways": list_pathways_for_gene(gene)}

@app.get("/flatmap/image")
def flatmap_image(
    gene: str,
    name: str | None = None,
    collapse: str = "max",
    format: str = "png",
):
    """
    Returns a PNG flatmap.
    - Default (no pathway): categorical clusters, clipped to mask.
    - Pathway-specific: clusters colored by GI* (mean/max), clipped to mask.
    - collapse: "max" or "mean".
    """
    with PLOT_LOCK:  # Prevent concurrent matplotlib writes
        df, mapping = load_nmf(gene)

        gi_vals = None
        if name:
            slice = cluster_pathway_scores(gene, name)
            merged = df.merge(slice, on="cluster", how="left", validate="many_to_one")
            if merged["gi_sum"].isna().any():
                raise HTTPException(status_code=500, detail="Missing cluster scores")
            gi_vals = merged["gi_sum"].astype(float)
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
            cluster_scores = merged.groupby("cluster")["gi_sum"].mean()

            Zi_gi_cluster = np.zeros_like(Zi_cluster, dtype=float)
            for clust, score in cluster_scores.items():
                Zi_gi_cluster[Zi_cluster == clust] = score

            cmap_redgreen = plt.cm.RdYlGn_r
            # Load global matrix
            global_df = load_global_max_scores()

            if gene.upper() in global_df.index:
                vi_max = global_df.loc[gene.upper()].max()  # global upper bound
                vi_min = cluster_scores.min()               # pathway-specific lower bound
            else:
                # fallback to local values
                vi_max = float(cluster_scores.abs().max())
                vi_min = cluster_scores.min()

            norm = plt.Normalize(vmin=vi_min, vmax=vi_max)

            Zi_gi_masked = np.ma.array(Zi_gi_cluster, mask=outer_mask)
            im = ax.imshow(Zi_gi_masked, origin="lower",
                        extent=(xmn_pad, xmx_pad, ymn_pad, ymx_pad),
                        cmap=cmap_redgreen, alpha=0.6, norm = norm,
                        interpolation="nearest", zorder=1)

            ax.contour(Xi, Yi, Zi_cluster_masked, levels=np.unique(df["cluster"]),
                    colors="black", linewidths=1.2, alpha=0.9, zorder=4)

            ax.scatter(merged["x"], merged["y"], s=150,
                    edgecolors="darkgrey", facecolors="none", linewidths=0, zorder=3)

            cb = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            cb.set_label("Gi* score\nGreen = Low, Red = High")

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

        fmt = format.lower().strip()
        if fmt not in {"png", "svg"}:
            raise HTTPException(status_code=400, detail="format must be 'png' or 'svg'")

        buf = io.BytesIO()

        if fmt == "svg":
            plt.savefig(
                buf,
                format="svg",
                bbox_inches="tight",
                transparent=True,
            )
            media_type = "image/svg+xml"
            filename = f"{gene.upper()}_{(name or 'flatmap').replace(' ', '_')}.svg"
        else:
            plt.savefig(
                buf,
                format="png",
                dpi=170,
                bbox_inches="tight",
                transparent=True,
            )
            media_type = "image/png"
            filename = f"{gene.upper()}_{(name or 'flatmap').replace(' ', '_')}.png"

        plt.close(fig)
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type=media_type,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

@app.get("/flatmap/summary")
def flatmap_summary(gene: str, pathway: str | None = None):
    gene = canonical_gene(gene)
    nmf, _ = load_nmf(gene)
    if not pathway:
        return {"summary": f"{gene} is divided into {nmf['cluster'].nunique()} regions of functional interest (RFIs)."}
    scores = cluster_pathway_scores(gene, pathway)
    best = scores.loc[scores["gi_sum"].idxmax()]
    return {"summary": f"This flatmap shows the Gi* score for the association of {gene} with {pathway.strip().upper()}. RFI {int(best['cluster'])} (zero-indexed) has the highest Gi* score: {best['gi_sum']:.4g}."}




# =========================================================
# ========= PANEL 3: /empirical (matplotlib) ======
# =========================================================
# Path to your calibration CSV
# Directory containing A.parquet, B.parquet, etc.
PARQUET_DIR = Path("data/Parquet_letter_concat")


def load_gene_data(gene: str) -> pd.DataFrame:
    try:
        return site_gene_table("calibration", gene)
    except HTTPException as exc:
        if exc.status_code == 404:
            return pd.DataFrame()
        raise



def fit_free_exponential(x, y):
    """Fit a*exp(-b*x)+c; all three parameters are estimated from the data."""
    from scipy.optimize import curve_fit
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(x) < 4 or len(np.unique(x)) < 3 or np.ptp(y) == 0:
        return None
    def exponential(rank, a, b, c):
        return a * np.exp(-b * rank) + c
    best = None
    span = max(float(np.ptp(x)), 1.0)
    for initial_b in [0.2 / span, 1.0 / span, 5.0 / span]:
        initial_c = float(np.median(y[-max(1, len(y)//10):]))
        initial_a = float(y[0] - initial_c) * np.exp(initial_b*x[0])
        try:
            params, _ = curve_fit(
                exponential, x, y, p0=[initial_a, initial_b, initial_c],
                bounds=([-np.inf, 0, -np.inf], [np.inf, np.inf, np.inf]),
                maxfev=50000,
            )
            prediction = exponential(x, *params)
            error = float(np.sum((y-prediction)**2))
            r2 = 1 - error / float(np.sum((y-y.mean())**2))
            if np.isfinite(prediction).all() and np.isfinite(r2):
                if best is None or error < best["error"]:
                    best = {"params": params, "r2": r2,
                            "error": error, "func": exponential}
        except (RuntimeError, ValueError, FloatingPointError):
            continue
    return best

@app.get("/calibration/image")
def calibration_image(gene: str):
    """Dynamic-scaled confidence with a free exponential fit only."""
    with PLOT_LOCK:
        sub = load_gene_data(gene)
        fig, ax = plt.subplots(figsize=(6, 4))
        try:
            if sub.empty:
                ax.axis("off")
                ax.text(0.5, 0.5, "We don't have Perturb-seq data\nfor this protein.",
                        ha="center", va="center", transform=ax.transAxes)
            else:
                sub = sub.copy()
                cols = ["adjusted_rank", "confidence"]
                sub[cols] = sub[cols].apply(pd.to_numeric, errors="coerce")
                sub = sub.replace([np.inf, -np.inf], np.nan).dropna(subset=cols)
                sub = sub.sort_values("adjusted_rank")
                x = sub["adjusted_rank"].to_numpy(dtype=float) + 1
                y = sub["confidence"].to_numpy(dtype=float)
                ax.scatter(x, y, s=30, alpha=0.7, label="Data")
                best = fit_free_exponential(x, y)
                if best is not None:
                    xx = np.linspace(x.min(), x.max(), 300)
                    ax.plot(xx, best["func"](xx, *best["params"]), color="red",
                            linewidth=2, label=f'Exponential; $R^2 = {best["r2"]:.3f}$')
                    ax.legend(loc="upper right", fontsize=9)
                else:
                    ax.text(0.02, 0.02, "Exponential fit unavailable", fontsize=9,
                            transform=ax.transAxes)
                # Preserve the existing green percentile highlight.
                if len(x):
                    x_min = float(x.min())
                    x_thresh = float(np.quantile(x, 0.1))
                    y_thresh = float(np.quantile(y, 0.9))
                    ax.add_patch(plt.Rectangle(
                        (x_min, y_thresh), x_thresh-x_min, float(y.max())-y_thresh,
                        facecolor="lightgreen", alpha=0.3, edgecolor="green",
                        linewidth=1.5, linestyle="--"))
                ax.set_xlim(left=1)
                ax.set_xlabel("Rank of TRNs (predicted using spatial statistics)")
                ax.set_ylabel(
                    f"Confidence of association between\n{canonical_gene(gene)} and each TRN\n(validated by Perturb-seq)",
                    fontsize=10, labelpad=8)
                ax.grid(False)
            buf = io.BytesIO()
            fig.tight_layout()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=160)
        finally:
            plt.close(fig)
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png",
                                 headers={"Cache-Control": "no-store"})



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
    df = site_gene_table("nmf", gene)
    return df[["gene", "residue", "cluster"]].to_dict(orient="records")



@app.get("/residues_with_pathways")
def get_residues_with_pathways(gene: str):
    nmf = site_gene_table("nmf", gene)[["gene", "residue", "cluster"]]
    scores = site_gene_table("scores", gene)
    return nmf.merge(scores, on=["gene", "cluster"], how="inner").to_dict(orient="records")



@app.get("/trn_by_cluster_or_residue")
def trn_by_cluster_or_residue(gene: str, cluster: int | None = None, residue: int | None = None, collapse: str = "max"):
    gene = canonical_gene(gene)
    if collapse not in {"max", "mean"}:
        raise HTTPException(status_code=400, detail="collapse must be max or mean")
    if cluster is not None and residue is not None:
        raise HTTPException(status_code=400, detail="Specify cluster or residue, not both")
    selected_cluster = cluster
    nmf = site_gene_table("nmf", gene)
    if residue is not None:
        match = nmf.loc[nmf["residue"].eq(residue), "cluster"]
        if match.empty:
            raise HTTPException(status_code=404, detail="Residue not found")
        selected_cluster = int(match.iloc[0])
    scores = site_gene_table("scores", gene)
    if selected_cluster is not None:
        scores = scores[scores["cluster"].eq(selected_cluster)]
    if scores.empty:
        raise HTTPException(status_code=404, detail="Cluster not found")
    agg = scores.groupby("pathway")["score"]
    result = (agg.mean() if collapse == "mean" else agg.max()).sort_values(ascending=False)
    return {"gene": gene, "n_trns": len(result), "aggregation": collapse,
            "cluster": cluster, "residue": residue,
            "pathways": result.rename("score").reset_index().head(500).to_dict(orient="records")}



# =========================================================
# =============== PATHWAY ENDPOINT ========================
# =========================================================

# Load once at startup
PATHWAY_MATRIX = site_matrix()

def gene_in_master_matrix(gene: str) -> bool:
    return canonical_gene(gene) in PATHWAY_MATRIX.index




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
from pathlib import Path
from fastapi.responses import StreamingResponse, Response, JSONResponse


@app.get("/confidence/image")
def confidence_image(protein: str):
    """
    Returns logistic fit plot (PNG) for the given protein
    using data from tahoe_confidence_metrics.csv.
    """
    import numpy as np
    from scipy.optimize import curve_fit
    from sklearn.metrics import r2_score

    def no_data_image():
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.axis("off")
        ax.text(
            0.5,
            0.5,
            "We don't have AI predictions for drug associations\nwith this protein.",
            ha="center",
            va="center",
            fontsize=12,
            wrap=True,
        )

        buf = io.BytesIO()
        fig.tight_layout()
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=160)
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

    with PLOT_LOCK:
        try:
            df = pd.read_csv("tahoe_confidence_metrics.csv")
            emp = df[df["protein"].str.upper() == protein.upper()].copy()

            # ---- If no data exists for this protein ----
            if emp.empty:
                return no_data_image()

            # ---- Normal processing ----
            emp = emp.reset_index(drop=True)
            if "index" not in emp.columns:
                emp = emp.reset_index(names="index")

            emp["norm_confidence"] = pd.to_numeric(
                emp["norm_confidence"], errors="coerce"
            )
            emp = emp.dropna(subset=["index", "norm_confidence"]).reset_index(drop=True)

            if emp.empty or len(emp) < 3:
                return no_data_image()

            x = emp["index"].to_numpy(dtype=float) + 1
            y = emp["norm_confidence"].to_numpy(dtype=float)

            # sort so anchor is first ranked drug
            order = np.argsort(x)
            x = x[order]
            y = y[order]

            x0, y0 = x[0], y[0]

            def logistic_fixed_first(x, k, xmid, c):
                L = (y0 - c) * (1 + np.exp(k * (x0 - xmid)))
                return c + L / (1 + np.exp(k * (x - xmid)))

            p0 = [-0.05, np.median(x), float(np.min(y))]
            popt, _ = curve_fit(logistic_fixed_first, x, y, p0=p0, maxfev=10000)

            y_pred = logistic_fixed_first(x, *popt)
            r2 = r2_score(y, y_pred)

            legend_label = f"$R^2 = {r2:.3f}$"

            fig, ax = plt.subplots(figsize=(6, 4))
            ax.scatter(x, y, s=30, alpha=0.7, label="Data")

            x_sorted = np.linspace(np.min(x), np.max(x), 300)
            ax.plot(
                x_sorted,
                logistic_fixed_first(x_sorted, *popt),
                color="red",
                label=legend_label,
            )
            ax.set_xlim(left=1)

            ax.set_xlabel("Rank of drugs (predicted using AI)")
            ax.set_ylabel(
                f"Confidence of association (0–1) between\n{protein} and each drug\n(validated by Tahoe-100M)"
            )
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
                headers={
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/confidence/rankings")
def confidence_rankings(protein: str):
    """
    Rank drugs for a protein based on the highest cluster log-odds value.
    """
    try:
        logodds_df = load_logodds_csv(protein)

        if "cluster_id" not in logodds_df.columns:
            return {"rankings": []}

        drug_cols = [c for c in logodds_df.columns if c != "cluster_id"]
        rankings = []

        for drug in drug_cols:
            vals = pd.to_numeric(logodds_df[drug], errors="coerce").dropna()
            if vals.empty:
                continue

            rankings.append({
                "drug": drug,
                "score": float(vals.max())
            })

        rankings = sorted(rankings, key=lambda x: x["score"], reverse=True)
        return {"rankings": rankings}

    except Exception as e:
        return {"error": str(e)}


@app.get("/confidence/summary")
def confidence_summary(protein: str):
    """
    Return a short descriptive summary for Panel 4:
    "[protein] has [x] mutations across [y] cell lines... [z] RFIs..."
    """
    try:
        # --- Load mutation + cell line counts ---
        mut_csv = Path("mutation_counts.csv")
        n_mut, n_cell = None, None
        if mut_csv.exists():
            mdf = pd.read_csv(mut_csv)
            if {"gene", "mut_count", "cell_line_count"}.issubset(mdf.columns):
                row = mdf[mdf["gene"].str.upper() == protein.upper()]
                if not row.empty:
                    n_mut = int(row.iloc[0]["mut_count"])
                    n_cell = int(row.iloc[0]["cell_line_count"])

        # --- Load NMF / cluster info ---
        nmf, _ = load_nmf(protein)
        n_clusters = nmf["cluster"].nunique() if "cluster" in nmf.columns else "multiple"

        # --- Count ranked drugs if available ---
        n_drugs = None
        try:
            logodds_df = load_logodds_csv(protein)
            if "cluster_id" in logodds_df.columns:
                n_drugs = len([c for c in logodds_df.columns if c != "cluster_id"])
        except Exception:
            pass

        s = (
            f"{protein.upper()} has {n_mut if n_mut is not None else 'multiple'} mutations "
            f"across {n_cell if n_cell is not None else 'several'} cell lines from "
            f"The Cancer Dependency Map. {protein.upper()} can be divided into "
            f"{n_clusters} regions of functional interest (RFIs). "
            f"We rank {n_drugs if n_drugs is not None else 'candidate'} drugs based on "
            f"the strongest region-specific association scores for {protein.upper()}. "
            f"This empirical calibration compares AI-predicted drug rankings with "
            f"confidence estimates derived from Tahoe-100M data."
        )

        return {"summary": s}

    except Exception as e:
        return {"error": str(e)}


# =========================================================
# ========= DRUG PAGE Drug Flatmap ======
# =========================================================

@lru_cache(maxsize=128)
def load_logodds_csv(gene: str) -> pd.DataFrame:
    import string

    letter = gene[0].upper() if gene and gene[0].isalpha() else "OTHER"
    base_dir = Path(__file__).resolve().parent / "logodds_cluster"
    filepath = base_dir / letter / f"{gene.upper()}_logodds_cluster.csv"

    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"No log-odds file found for {gene}")

    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load {filepath.name}: {e}")

    # Normalize all column names EXCEPT 'cluster_id'
    table = str.maketrans("", "", string.punctuation)
    new_cols = []
    for c in df.columns:
        c_clean = c.strip().lower()
        if c_clean == "cluster_id":
            new_cols.append("cluster_id")
        else:
            c_clean = c_clean.translate(table).replace(" ", "")
            new_cols.append(c_clean)
    df.columns = new_cols

    return df


@app.get("/flatmap/proteins")
def flatmap_proteins(drug: str):
    """
    Returns all proteins listed in drug_lists/[drug].csv.
    The search is case-insensitive and punctuation-insensitive,
    but canonical filenames remain lowercase with no spaces.
    """
    import string
    base_dir = Path(__file__).resolve().parent / "drug_lists"
    if not base_dir.exists():
        raise HTTPException(status_code=404, detail="No drug_lists directory found")

    # --- Canonical normalization (for storage and filenames) ---
    drug_canonical = drug.lower().replace(" ", "")

    # --- For comparison only, also remove punctuation ---
    table = str.maketrans("", "", string.punctuation)
    drug_cmp = drug_canonical.translate(table)

    # --- Check filenames ---
    for csv_path in base_dir.glob("*.csv"):
        name_canonical = csv_path.stem.lower().replace(" ", "")
        name_cmp = name_canonical.translate(table)

        if name_cmp == drug_cmp:  # punctuation-insensitive match
            try:
                df = pd.read_csv(csv_path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to load {csv_path.name}: {e}")

            if "protein" not in df.columns:
                raise HTTPException(status_code=400, detail=f"No 'protein' column in {csv_path.name}")

            proteins = sorted(df["protein"].dropna().unique().tolist())
            return {"proteins": proteins}

    raise HTTPException(status_code=404, detail=f"No matching file for drug '{drug}' found")




@app.get("/flatmap/drug")
def flatmap_drug(gene: str, drug: str, format: str = "png"):
    """
    Returns a flatmap colored by log-odds values for a given drug.
    - gene: protein name (e.g., BRAF)
    - drug: drug column name in the CSV (case-insensitive)
    - format: "png" or "svg"
    Canonical rule: lowercase + no spaces
    Comparison rule: punctuation-insensitive
    """
    import string
    from matplotlib import patheffects

    with PLOT_LOCK:
        nmf, mapping = load_nmf(gene)
        logodds_df = load_logodds_csv(gene)

        if "cluster_id" not in logodds_df.columns:
            raise HTTPException(status_code=400, detail="Missing cluster_id column in CSV")

        logodds_df["cluster_id"] = logodds_df["cluster_id"].astype(int)
        nmf["cluster"] = nmf["cluster"].astype(int)

        # --- Canonical normalization ---
        drug_canonical = drug.lower().replace(" ", "")

        # --- Comparison normalization (ignore punctuation only for matching) ---
        table = str.maketrans("", "", string.punctuation)
        drug_cmp = drug_canonical.translate(table)

        drug_col = next(
            (
                c for c in logodds_df.columns
                if c.lower().replace(" ", "").translate(table) == drug_cmp
            ),
            None
        )

        if not drug_col:
            raise HTTPException(status_code=404, detail=f"Drug {drug} not found in log-odds file")

        # --- Merge and prepare ---
        merged = pd.merge(
            nmf,
            logodds_df[["cluster_id", drug_col]],
            left_on="cluster",
            right_on="cluster_id",
            how="left"
        )
        merged[drug_col] = pd.to_numeric(merged[drug_col], errors="coerce").fillna(0.0)

        # --- Grid setup ---
        xmn, xmx = merged["x"].min(), merged["x"].max()
        ymn, ymx = merged["y"].min(), merged["y"].max()
        pad_x = 0.05 * (xmx - xmn)
        pad_y = 0.05 * (ymx - ymn)
        xmn_pad, xmx_pad = xmn - pad_x, xmx + pad_x
        ymn_pad, ymx_pad = ymn - pad_y, ymx + pad_y

        nx, ny = 400, 400
        xi = np.linspace(xmn_pad, xmx_pad, nx)
        yi = np.linspace(ymn_pad, ymx_pad, ny)
        Xi, Yi = np.meshgrid(xi, yi)

        # --- Interpolate grids ---
        Zi_cluster = griddata(
            (merged["x"], merged["y"]),
            merged["cluster"],
            (Xi, Yi),
            method="nearest"
        )
        Zi_alt = griddata(
            (merged["x"], merged["y"]),
            merged["altitude"],
            (Xi, Yi),
            method="linear"
        )

        # --- Masks for inside/outside region ---
        outer_mask = np.isnan(Zi_alt) | (Zi_alt <= np.nanmin(Zi_alt) + 1e-6)
        inside_mask = (~outer_mask).astype(float)

        # --- Values per cluster ---
        cluster_values = merged.groupby("cluster")[drug_col].mean()
        Zi_val = np.zeros_like(Zi_cluster, dtype=float)
        for clust, val in cluster_values.items():
            Zi_val[Zi_cluster == clust] = val
        Zi_masked = np.ma.array(Zi_val, mask=outer_mask)

        # --- Plot setup ---
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.set_aspect("equal")
        ax.axis("off")

        cmap = plt.cm.coolwarm
        norm = plt.Normalize(vmin=cluster_values.min(), vmax=cluster_values.max())

        # --- Main heatmap ---
        im = ax.imshow(
            Zi_masked,
            origin="lower",
            extent=(xmn_pad, xmx_pad, ymn_pad, ymx_pad),
            cmap=cmap,
            norm=norm,
            interpolation="nearest",
            alpha=0.7
        )

        # --- Mask outside region before contouring ---
        Zi_cluster_masked = np.ma.array(Zi_cluster, mask=outer_mask)

        # --- Draw internal cluster boundaries ---
        ax.contour(
            Xi, Yi, Zi_cluster_masked,
            levels=np.unique(merged["cluster"]),
            colors="black", linewidths=0.8, alpha=0.6, zorder=4
        )

        # --- Draw thick outer outline ---
        ax.contour(
            Xi, Yi, inside_mask,
            levels=[0.5],
            colors="black", linewidths=2.5, zorder=6
        )

        # --- Colorbar ---
        cb = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cb.set_label(f"Log-odds for {drug}")

        # ---------- Cluster Annotations ----------
        try:
            ann_path = Path(__file__).resolve().parent / "data" / "annotated_clusters.csv"
            if ann_path.exists():
                ann = pd.read_csv(ann_path)
                ann_sub = ann[ann["gene"].str.upper() == gene.upper()]

                if not ann_sub.empty:
                    ann_sub["cluster"] = ann_sub["cluster"].map(mapping)
                    ann_sub = ann_sub.dropna(subset=["cluster"])
                    ann_sub["cluster"] = ann_sub["cluster"].astype(int)

                    centroids = nmf.groupby("cluster")[["x", "y"]].mean()

                    for _, row in ann_sub.iterrows():
                        clust = row["cluster"]
                        label = str(row["annotation_type"])
                        if clust in centroids.index:
                            sub_points = nmf[nmf["cluster"] == clust]
                            if len(sub_points) < 20:
                                cx, cy = sub_points[["x", "y"]].median()
                            else:
                                cx, cy = centroids.loc[clust]

                            cx_true, cy_true = cx, cy

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
                                ax.plot(
                                    [cx_true, cx],
                                    [cy_true, cy],
                                    color="black",
                                    linewidth=0.8,
                                    zorder=998
                                )

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

            ax.set_xlim(xmn_pad - 0.1 * (xmx - xmn), xmx_pad + 0.1 * (xmx - xmn))
            ax.set_ylim(ymn_pad - 0.1 * (ymx - ymn), ymx_pad + 0.1 * (ymx - ymn))

        except Exception as e:
            print("[flatmap_drug][WARN] Could not add annotations:", e)

        fig.tight_layout(pad=0)

        fmt = format.lower().strip()
        if fmt not in {"png", "svg"}:
            raise HTTPException(status_code=400, detail="format must be 'png' or 'svg'")

        buf = io.BytesIO()

        safe_drug = re.sub(r"[^A-Za-z0-9._-]+", "_", drug).strip("_") or "drug"

        if fmt == "svg":
            plt.savefig(
                buf,
                format="svg",
                bbox_inches="tight",
                transparent=True,
            )
            media_type = "image/svg+xml"
            filename = f"{gene.upper()}_{safe_drug}.svg"
        else:
            plt.savefig(
                buf,
                format="png",
                dpi=170,
                bbox_inches="tight",
                transparent=True,
            )
            media_type = "image/png"
            filename = f"{gene.upper()}_{safe_drug}.png"

        plt.close(fig)
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type=media_type,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )




# =========================================================
# =============== DOWNLOADS ENDPOINT ======================
# =========================================================

def build_panel2_nmf_csv(gene: str) -> pd.DataFrame:
    """
    Downloadable 2D NMF info using the exact same cluster numbering
    as Panel 2.
    """
    df_all = load_gene_parquet(gene)
    nmf_raw = df_all[df_all["table"] == "nmfinfo"].copy()

    if nmf_raw.empty:
        raise HTTPException(status_code=404, detail=f"No nmfinfo data found for {gene}")

    nmf_raw = nmf_raw.rename(columns={
        "res": "residue",
        "x_axis": "x",
        "y_axis": "y",
        "clust": "cluster",
    })

    # normalize clusters exactly the same way as Panel 2
    nmf_raw["cluster"] = pd.to_numeric(nmf_raw["cluster"], errors="coerce")
    nmf_raw = nmf_raw.dropna(subset=["cluster"]).copy()
    nmf_raw["cluster"], _ = normalize_clusters(nmf_raw["cluster"])

    keep_cols = ["gene", "residue", "x", "y", "cluster", "altitude"]
    nmf_raw = nmf_raw[[c for c in keep_cols if c in nmf_raw.columns]].copy()

    nmf_raw["gene"] = nmf_raw["gene"].astype(str).str.upper()
    nmf_raw["residue"] = pd.to_numeric(nmf_raw["residue"], errors="coerce")
    nmf_raw["cluster"] = pd.to_numeric(nmf_raw["cluster"], errors="coerce")

    nmf_raw = nmf_raw.dropna(subset=["residue", "x", "y", "cluster"]).copy()
    nmf_raw["residue"] = nmf_raw["residue"].astype(int)
    nmf_raw["cluster"] = nmf_raw["cluster"].astype(int)

    return nmf_raw.sort_values(["cluster", "residue"]).reset_index(drop=True)


def build_panel2_cluster_gi_csv(gene: str, pathway: str) -> pd.DataFrame:
    df = cluster_pathway_scores(gene, pathway).rename(columns={"gi_sum": "gi_score"})
    df.insert(0, "pathway", pathway.strip().upper())
    df.insert(0, "gene", canonical_gene(gene))
    return df[["gene", "pathway", "cluster", "gi_score"]].sort_values("cluster")



def build_panel4_cluster_logodds_csv(gene: str, drug: str) -> pd.DataFrame:
    """
    Download cluster-level logodds info using the same source logic
    as the drug flatmap: load_logodds_csv(gene).
    """
    import string

    logodds_df = load_logodds_csv(gene)

    if "cluster_id" not in logodds_df.columns:
        raise HTTPException(status_code=500, detail="Missing cluster_id column in logodds file")

    drug_canonical = drug.lower().replace(" ", "")
    table = str.maketrans("", "", string.punctuation)
    drug_cmp = drug_canonical.translate(table)

    drug_col = next(
        (
            c for c in logodds_df.columns
            if c.lower().replace(" ", "").translate(table) == drug_cmp
        ),
        None
    )

    if not drug_col:
        raise HTTPException(status_code=404, detail=f"Drug {drug} not found for {gene}")

    out = logodds_df[["cluster_id", drug_col]].copy()
    out = out.rename(columns={"cluster_id": "cluster", drug_col: "logodds"})

    out["cluster"] = pd.to_numeric(out["cluster"], errors="coerce")
    out["logodds"] = pd.to_numeric(out["logodds"], errors="coerce")
    out = out.dropna(subset=["cluster"]).copy()
    out["cluster"] = out["cluster"].astype(int)

    out.insert(0, "drug", drug)
    out.insert(0, "gene", gene.upper())

    return out[["gene", "drug", "cluster", "logodds"]].sort_values("cluster").reset_index(drop=True)


@app.get("/downloads/protein_trn_csv")
def download_protein_trn_csv(gene: str, pathway: str, kind: str):
    """
    kind:
      - nmf2d
      - cluster_gi
    """
    try:
        safe_pathway = re.sub(r"[^A-Za-z0-9_\-]+", "_", pathway.strip())

        if kind == "nmf2d":
            df = build_panel2_nmf_csv(gene)
            filename = f"{gene.upper()}_{safe_pathway}_2d_nmf_info.csv"
        elif kind == "cluster_gi":
            df = build_panel2_cluster_gi_csv(gene, pathway)
            filename = f"{gene.upper()}_{safe_pathway}_cluster_gi_info.csv"
        else:
            raise HTTPException(status_code=400, detail="kind must be 'nmf2d' or 'cluster_gi'")

        csv_data = df.to_csv(index=False)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/downloads/protein_drug_csv")
def download_protein_drug_csv(gene: str, drug: str, kind: str):
    """
    kind:
      - nmf2d
      - cluster_logodds
    """
    try:
        if kind == "nmf2d":
            df = build_panel2_nmf_csv(gene)
            safe_drug = re.sub(r"[^A-Za-z0-9_\-]+", "_", drug.strip())
            filename = f"{gene.upper()}_{safe_drug}_2d_nmf_info.csv"
        elif kind == "cluster_logodds":
            df = build_panel4_cluster_logodds_csv(gene, drug)
            safe_drug = re.sub(r"[^A-Za-z0-9_\-]+", "_", drug.strip())
            filename = f"{gene.upper()}_{safe_drug}_cluster_logodds_info.csv"
        else:
            raise HTTPException(status_code=400, detail="kind must be 'nmf2d' or 'cluster_logodds'")

        csv_data = df.to_csv(index=False)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse

BASE_DIR = Path(__file__).resolve().parent


DOWNLOADABLE_FILES = {
    "gene_ontologies_and_pfam.csv": {
        "description": "Gene Ontology info (biological process, cellular component, molecular function) and Protein Families for all proteins",
        "path": BASE_DIR / "gene_ontologies_and_pfam.csv",
    },
    "all_protein_trn_cluster_scores.csv": {
        "description": "Gi* scores for all TRNs and protein clusters (mass download)",
        "path": BASE_DIR / "all_protein_trn_cluster_scores.csv",
    },
    "all_protein_drug_cluster_scores.csv": {
        "description": "Log odds scores for all drugs and protein clusters (mass download)",
        "path": BASE_DIR / "all_protein_drug_cluster_scores.csv",
    },
    "protein_trn_category_annotation.csv": {
        "description": "Proteins annotated by function (categories related to TRNs)",
        "path": BASE_DIR / "protein_trn_category_annotation.csv",
    },
    "protein_drug_category_annotation.csv": {
        "description": "Proteins annotated by function (categories related to drugs)",
        "path": BASE_DIR / "protein_drug_category_annotation.csv",
    },
    "protein_network_metrics.csv": {
        "description": "Metrics from protein network analysis; proteins as nodes, TRNs as edges",
        "path": BASE_DIR / "protein_network_metrics.csv",
    },
    "protein_network_edges.csv": {
        "description": "Network structure from protein network analysis; proteins as nodes, TRNs as edges",
        "path": BASE_DIR / "protein_network_edges.csv",
    },
    "trn_network_metrics.csv": {
        "description": "Metrics from TRN network analysis; TRNs as nodes, proteins as edges",
        "path": BASE_DIR / "trn_network_metrics.csv",
    },
    "trn_network_edges.csv": {
        "description": "Network structure from TRN network analysis; TRNs as nodes, proteins as edges",
        "path": BASE_DIR / "trn_network_edges.csv",
    },
    "drug_network_metrics.csv": {
        "description": "Metrics from drug network analysis; drugs as nodes, proteins as edges",
        "path": BASE_DIR / "drug_network_metrics.csv",
    },
    "drug_network_edges.csv": {
        "description": "Network structure from drug network analysis; drugs as nodes, proteins as edges",
        "path": BASE_DIR / "drug_network_edges.csv",
    },
}



HF_BULK_DOWNLOADS = {
    "all_protein_trn_cluster_scores.csv": "Gi* scores for all TRNs and protein clusters (mass download)",
    "all_protein_nmf.csv": "NMF residue coordinates, altitude, and original zero-based clusters",
    "protein_trn_scores.csv": "Protein by TRN maximum Gi* score matrix",
}

def stream_site_csv(filename: str):
    if filename == "protein_trn_scores.csv":
        # Keep protein identifiers as the first CSV column.
        yield site_matrix().to_csv(index=True)
        return
    kind = "scores" if filename == "all_protein_trn_cluster_scores.csv" else "nmf"
    letters = sorted({g[0] if g[0].isalpha() else "OTHER" for g in site_genes()})
    header = True
    for letter in letters:
        df = pd.read_parquet(site_file(f"{kind}/{letter}.parquet"))
        if kind == "scores":
            df = df.rename(columns={"score": "gi_score"})
            df = df[["gene", "pathway", "cluster", "gi_score"]]
        # Bound CSV conversion memory while streaming the response.
        for offset in range(0, len(df), 10000):
            yield df.iloc[offset:offset+10000].to_csv(index=False, header=header)
            header = False

@app.get("/downloads/reference_files")
def list_reference_files():
    files = [{"name": name, "description": description,
              "href": f"/downloads/reference/{name}"}
             for name, description in HF_BULK_DOWNLOADS.items()]
    for filename, meta in DOWNLOADABLE_FILES.items():
        if filename not in HF_BULK_DOWNLOADS and meta["path"].exists():
            files.append({"name": filename, "description": meta["description"],
                          "href": f"/downloads/reference/{filename}"})
    return {"files": files}



@app.get("/downloads/reference/{filename:path}")
def download_reference_file(filename: str):
    if filename in HF_BULK_DOWNLOADS:
        # Resolve the first source before response headers are sent.
        if filename == "protein_trn_scores.csv":
            site_matrix()
        else:
            kind = "scores" if filename == "all_protein_trn_cluster_scores.csv" else "nmf"
            gene = sorted(site_genes())[0]
            letter = gene[0] if gene[0].isalpha() else "OTHER"
            site_file(f"{kind}/{letter}.parquet")
        return StreamingResponse(
            stream_site_csv(filename), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"',
                     "X-Data-Revision": SITE_REVISION})
    if filename not in DOWNLOADABLE_FILES:
        raise HTTPException(status_code=404, detail="File not found")
    path = DOWNLOADABLE_FILES[filename]["path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")
    return FileResponse(path=path, media_type="text/csv", filename=filename)



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
    nmf = site_gene_table("nmf", gene)
    return {str(int(row.residue)): BASE_COLORS[int(row.cluster) % len(BASE_COLORS)]
            for row in nmf.itertuples()}


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
    return {"proteins": sorted(site_genes())}



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
    
@app.get("/drugs/list")
def drugs_list():
    import string
    from pathlib import Path
    import pandas as pd
    from fastapi import HTTPException

    csv_path = Path("drugs.csv")
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="drugs.csv not found")

    df = pd.read_csv(csv_path)
    col = df.columns[0]
    drugs = df[col].dropna().astype(str)
    cleaned = sorted({d.lower().strip() for d in drugs if d.strip()})
    return {"drugs": cleaned}


@app.get("/data/release")
def data_release():
    return {"repo": SITE_REPO, "revision": SITE_REVISION,
            "score": "scores_mutation_density_normalized", "score_label": "Gi* score",
            "cluster_numbering": "zero_based_original_nmf",
            "calibration": "standard",
            "panel3_fit": "free_exponential"}

# Existing local reference downloads remain available.

@app.get("/downloads/calibration_csv")
def download_calibration_csv(gene: str):
    gene = canonical_gene(gene)
    df = load_gene_data(gene)
    if df.empty:
        raise HTTPException(status_code=404, detail="No calibration data for this protein")
    safe_gene = re.sub(r"[^A-Z0-9._-]", "_", gene)
    return Response(df.to_csv(index=False), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{safe_gene}_calibration.csv"',
                             "X-Data-Revision": SITE_REVISION})
