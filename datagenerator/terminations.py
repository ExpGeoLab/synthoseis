"""Detect stratal terminations (toplap, onlap, downlap, offlap, truncation).

Works on a 2D section through a stack of surfaces, e.g. a clinoform package.

Surfaces are given as heights (larger = higher = younger), ordered oldest to
youngest, and sampled along a section whose x axis points basinward (the
direction the shelf edge advances). A layer is the strata between two
consecutive surfaces; it terminates wherever its thickness falls to zero.

Classification of each termination of a layer (rules of thumb, see Mitchum
et al. 1977):

* up-dip (landward) end of a basinward-dipping layer: toplap, or truncation
  when the upper surface there is an erosion surface
* up-dip end of a flat or landward-dipping layer: onlap
* down-dip (basinward) end of a basinward-dipping layer: downlap
* down-dip end of a flat or landward-dipping layer: onlap
* offlap is the stacking pattern of toplaps that step basinward AND downward
  from one layer to the next (a falling shelf edge, forced regression); a run
  of at least three such toplaps is relabelled offlap.
"""

import numpy as np

TYPES = ("toplap", "onlap", "downlap", "offlap", "truncation")


def _segments(mask):
    """(start, stop) index pairs of the True runs in a 1D boolean array."""
    padded = np.concatenate(([False], mask, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    return list(zip(edges[::2], edges[1::2]))


def detect_terminations(
    heights,
    x,
    erosion=None,
    min_thickness=0.25,
    flat_dip=0.002,
    min_length=3,
    offlap_drop=0.4,
):
    """Find stratal terminations along a section.

    Parameters
    ----------
    heights : (n_surfaces, n_points) array, oldest surface first
    x : (n_points,) positions, increasing basinward
    erosion : optional (n_points,) height of an erosion surface, to separate
        erosional truncation from toplap
    min_thickness : layer thickness (same units as heights) treated as zero
    flat_dip : |dip| (height per unit x) below which a layer counts as flat
    min_length : minimum layer length in samples to be considered
    offlap_drop : minimum height drop between successive toplaps for offlap

    Returns a list of dicts with keys type, layer, x, z (height of the point).
    """
    h = np.asarray(heights, dtype=float)
    x = np.asarray(x, dtype=float)
    n_surf, n_pts = h.shape
    window = max(3, n_pts // 20)
    found = []

    for t in range(n_surf - 1):
        thickness = h[t + 1] - h[t]
        for a, b in _segments(thickness > min_thickness):
            if b - a < min_length:
                continue
            mid = 0.5 * (h[t] + h[t + 1])

            def dip(i0, i1):
                i0, i1 = max(i0, a), min(i1, b - 1)
                if i1 <= i0:
                    return 0.0
                return (mid[i1] - mid[i0]) / (x[i1] - x[i0])

            # a basinward-dipping layer has negative dip (height falls with x)
            if a > 0:  # landward (up-dip) end
                d = dip(a, a + window)
                z = h[t, a]
                if d < -flat_dip:
                    on_erosion = erosion is not None and abs(h[t + 1, a] - erosion[a]) < 2 * min_thickness
                    kind = "truncation" if on_erosion else "toplap"
                else:
                    kind = "onlap"
                found.append({"type": kind, "layer": t, "x": float(x[a]), "z": float(z)})
            if b < n_pts:  # basinward (down-dip) end
                d = dip(b - 1 - window, b - 1)
                z = h[t, b - 1]
                kind = "downlap" if d < -flat_dip else "onlap"
                found.append({"type": kind, "layer": t, "x": float(x[b - 1]), "z": float(z)})

    # offlap: runs of toplaps stepping basinward and downward
    tops = sorted((f for f in found if f["type"] == "toplap"), key=lambda f: f["layer"])
    run = []
    for f in tops + [None]:
        if f is not None and (not run or (f["x"] > run[-1]["x"] and f["z"] < run[-1]["z"] - offlap_drop)):
            run.append(f)
            continue
        if len(run) >= 3:
            for r in run:
                r["type"] = "offlap"
        run = [f] if f is not None else []

    return sorted(found, key=lambda f: (f["layer"], f["x"]))


def summarize(terminations):
    """Count terminations by type."""
    out = {k: 0 for k in TYPES}
    for t in terminations:
        out[t["type"]] += 1
    return out
