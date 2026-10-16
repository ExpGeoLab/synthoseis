"""Quick previews of geological features (channels, fans, clinoforms).

Runs just the feature generator on a small grid, without the full pipeline, so
parameters can be tuned interactively.
"""

import threading
import time
from types import SimpleNamespace
from typing import Optional

import numpy as np

# The channel and fan generators use numpy's global random state
_RANDOM_LOCK = threading.Lock()


def _line_ends(nx: int, ny: int, azimuth_deg: Optional[float]):
    """End points (x0, y0, x1, y1) of the section line through the cube centre.

    azimuth None -> along the second axis; otherwise along (cos a, sin a)."""
    cx, cy = (nx - 1) / 2.0, (ny - 1) / 2.0
    if azimuth_deg is None:
        return cx, 0.0, cx, ny - 1.0
    a = np.radians(azimuth_deg)
    half = (min(nx, ny) - 1) / 2.0
    return (
        cx - half * np.cos(a),
        cy - half * np.sin(a),
        cx + half * np.cos(a),
        cy + half * np.sin(a),
    )


def _sample_along(arr: np.ndarray, line, n_points: int = 200) -> np.ndarray:
    """Sample a 2D array, or each slice of a 3D array's last axis, along a line."""
    from scipy.ndimage import map_coordinates

    x0, y0, x1, y1 = line
    xs = np.linspace(x0, x1, n_points)
    ys = np.linspace(y0, y1, n_points)
    if arr.ndim == 2:
        return map_coordinates(arr, [xs, ys], order=1, mode="nearest")
    return np.stack(
        [
            map_coordinates(arr[..., k], [xs, ys], order=1, mode="nearest")
            for k in range(arr.shape[2])
        ]
    )


def _fake_cfg(req) -> SimpleNamespace:
    """Minimal stand-in for Parameters, enough for the feature generators."""
    return SimpleNamespace(
        cube_shape=(req.cube_size, req.cube_size, 1250),
        digi=req.digi,
        infill_factor=req.infill_factor,
        verbose=False,
        qc_plots=False,
        work_subfolder=".",
        channel_count=tuple(req.channel_count),
        channel_width=tuple(req.channel_width),
        channel_thickness_scale=req.channel_thickness_scale,
        channel_bin_size=req.channel_bin_size,
    )


def _round(a, nd=2):
    return np.round(np.asarray(a, dtype=float), nd).tolist()


def preview_feature(req) -> dict:
    """Generate one feature and return a thickness map (m) and a section."""
    t0 = time.time()
    nx = ny = req.cube_size
    m_per_sample = req.digi / req.infill_factor  # ms (~ m) per work sample
    info: dict = {}
    erosion_line = None
    terminations = None

    if req.feature == "channels":
        from datagenerator.Horizons import FluvialChannels

        cfg = _fake_cfg(req)
        with _RANDOM_LOCK:
            if req.seed is not None:
                np.random.seed(req.seed)
            fc = FluvialChannels(cfg, 200)
            thickness = fc._generate_channel_thickness_map() * m_per_sample
        line = _line_ends(nx, ny, None)
        profile = _sample_along(thickness, line)
        horizons = [np.zeros_like(profile), -profile]
        labels = ["base", "top of channel sand"]

    elif req.feature == "fans":
        from datagenerator.Horizons import BasinFloorFans

        cfg = _fake_cfg(req)
        with _RANDOM_LOCK:
            if req.seed is not None:
                np.random.seed(req.seed)
            bff = BasinFloorFans(cfg, 200)
            bff.fan_thicknesses = []
            fan = bff._generate_basin_floor_fan(10)
            thickness = fan * req.infill_factor * m_per_sample
        line = _line_ends(nx, ny, None)
        profile = _sample_along(thickness, line)
        horizons = [np.zeros_like(profile), -profile]
        labels = ["base", "top of fan"]

    elif req.feature == "clinoforms":
        from datagenerator.clinoforms import clinoform_package

        rng = np.random.default_rng(req.seed)
        # draw the azimuth here so the section can run along the progradation
        azimuth = req.azimuth if req.azimuth is not None else float(rng.uniform(0, 360))
        pkg, erosion = clinoform_package(
            nx,
            ny,
            n_clinoforms=req.n_clinoforms,
            azimuth=azimuth,
            relief_m=req.relief_m,
            foreset_angle_deg=req.foreset_angle_deg,
            step_m=req.step_m,
            aggradation_m=req.aggradation_m,
            digi=req.digi,
            infill=req.infill_factor,
            bin_size=req.channel_bin_size,
            erosion=req.erosion,
            erosion_position=req.erosion_position,
            erosion_depth_m=req.erosion_depth_m,
            n_valleys=req.n_valleys,
            valley_depth_m=req.valley_depth_m,
            stepdown_m=req.stepdown_m,
            return_erosion=True,
            rng=rng,
        )
        thickness = (pkg[..., -1] - pkg[..., 0]) * m_per_sample
        line = _line_ends(nx, ny, azimuth)
        surfaces = _sample_along(pkg, line) * m_per_sample  # (n, points)
        horizons = [-s for s in surfaces]
        labels = [f"clinoform {i}" for i in range(len(horizons))]
        horizons.append(np.zeros_like(horizons[0]))  # basin floor
        labels.append("basin floor")
        info = {"n_clinoforms": int(pkg.shape[2]), "azimuth": round(azimuth, 1)}
        from datagenerator.terminations import detect_terminations

        length_cells = float(np.hypot(line[2] - line[0], line[3] - line[1]))
        x_cells = np.linspace(0.0, length_cells, surfaces.shape[1])
        heights = np.vstack([np.zeros(surfaces.shape[1]), surfaces])  # floor first
        erosion_h = None if erosion is None else _sample_along(erosion, line) * m_per_sample
        terminations = detect_terminations(heights, x_cells, erosion=erosion_h)
        if erosion is not None:
            erosion_line = -_sample_along(erosion, line) * m_per_sample
            info["erosion"] = 1
    else:
        raise ValueError(f"Unknown feature: {req.feature}")

    length = float(np.hypot(line[2] - line[0], line[3] - line[1]))
    x_axis = np.linspace(0.0, length, horizons[0].shape[0])
    return {
        "feature": req.feature,
        "nx": nx,
        "ny": ny,
        "thickness": _round(thickness),
        "max_thickness_m": float(np.max(thickness)),
        "covered_pct": float(100.0 * np.mean(thickness > 0.05)),
        "line": [float(v) for v in line],
        "section": {
            "x_cells": _round(x_axis, 1),
            "horizons": [_round(h) for h in horizons],
            "labels": labels,
            "erosion": None if erosion_line is None else _round(erosion_line),
            "terminations": None
            if terminations is None
            else [{"type": t["type"], "x": round(t["x"], 1), "z": round(-t["z"], 2)} for t in terminations],
        },
        "info": info,
        "elapsed_s": round(time.time() - t0, 1),
    }
