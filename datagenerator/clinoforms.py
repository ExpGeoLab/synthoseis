"""Geometric clinoform generator.

Builds a clinoform package that can be inserted into the SynToSeis horizon
stack (like fans and channels).

Model
-----
Each clinoform is a time line of a prograding shelf-slope system. A single
sigmoidal profile P(u) (topset - foreset - bottomset), with u the distance
from the shelf edge along the progradation direction, is translated seaward
with each time step while the shelf aggrades:

    z_t(s) = Z0 - aggradation * t + P(s - edge_t)

P is non-decreasing in u, so z_t never gets deeper with time and surfaces
cannot cross: layer thickness is >= 0 everywhere (zero at the downlap).

Units: depth in work-cube samples (as in the depth maps), 1 sample = digi /
infill_factor ms, 1 ms of TWT ~ 1 m of sediment, lateral cell = bin_size m.
"""

import numpy as np
from scipy.ndimage import gaussian_filter, gaussian_filter1d

DIGI = 4.0  # ms
INFILL = 10
MS_PER_METRE = 1.0
BIN_SIZE = 25.0  # m


def metres_to_samples(m, digi=DIGI, infill=INFILL):
    return m * MS_PER_METRE * infill / digi


def _smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def clinoform_profile(u, relief, width, topset_slope=0.0005, bottomset_slope=0.0003):
    """Non-decreasing shelf-slope-basin profile, 0 at the shelf edge (u = 0)."""
    return (
        topset_slope * np.minimum(u, 0.0)
        + relief * _smoothstep(u / width)
        + bottomset_slope * np.maximum(u - width, 0.0)
    )


def clinoform_package(
    nx,
    ny,
    n_clinoforms=None,
    azimuth=None,
    relief_m=None,
    foreset_angle_deg=None,
    step_m=None,
    aggradation_m=None,
    digi=DIGI,
    infill=INFILL,
    bin_size=BIN_SIZE,
    erosion=None,
    erosion_position=None,
    erosion_depth_m=None,
    n_valleys=None,
    valley_depth_m=None,
    stepdown_m=None,
    return_erosion=False,
    rng=None,
):
    """Return D, shape (nx, ny, n): height of each clinoform surface above a flat
    basin floor (samples, >= 0). Index 0 is the oldest surface, the last the
    youngest. Surface t sits at `base - D[..., t]`; where D is 0 the surface rests
    on the basin floor (downlap). The topsets are flat and the foresets descend
    basinward, as in a real prograding system.

    aggradation_m: shelf rise per clinoform. Positive builds topsets (aggradation),
    zero gives pure progradation (toplap), negative is a falling shelf edge
    (forced regression) whose terminations step basinward and downward (offlap).

    erosion: add an erosional unconformity (None = random 50%). It cuts down
    through the topset and upper foreset of everything older than clinoform
    `erosion_position` (0-1 through the package), removing section (truncation),
    with `n_valleys` incised valleys that cut further and continue down the
    foreset. Above it a younger lowstand wedge is deposited: its first topset
    starts on the erosion surface and stays horizontal, each following topset steps
    down by `stepdown_m` (negative steps up) and starts on the previous foreset,
    and every foreset downlaps onto the erosion surface. Valleys fill with
    horizontal strata.
    With return_erosion=True returns (D, E) where E is the erosion surface in the
    same frame as D (samples above the oldest surface), or None."""
    rng = np.random.default_rng() if rng is None else rng
    n = int(rng.integers(12, 26)) if n_clinoforms is None else n_clinoforms
    azimuth = rng.uniform(0.0, 360.0) if azimuth is None else azimuth
    relief_m = rng.uniform(80.0, 250.0) if relief_m is None else relief_m
    foreset_angle_deg = (
        rng.uniform(1.0, 3.5) if foreset_angle_deg is None else foreset_angle_deg
    )
    step_m = rng.uniform(250.0, 700.0) if step_m is None else step_m
    aggradation_m = rng.uniform(0.0, 1.5) if aggradation_m is None else aggradation_m

    relief = metres_to_samples(relief_m, digi, infill)
    width = relief_m / np.tan(np.radians(foreset_angle_deg)) / bin_size  # cells
    step = step_m / bin_size  # cells per clinoform
    aggr = metres_to_samples(aggradation_m, digi, infill)

    # coordinate along progradation (s) and along strike (q), in cells
    x = np.arange(nx) - (nx - 1) / 2.0
    y = np.arange(ny) - (ny - 1) / 2.0
    xx, yy = np.meshgrid(x, y, indexing="ij")
    a = np.radians(azimuth)
    s = xx * np.cos(a) + yy * np.sin(a)
    q = -xx * np.sin(a) + yy * np.cos(a)

    # shelf-edge position per clinoform: steady progradation plus random jitter,
    # with a smooth along-strike wobble so the edge is not a straight line
    q_axis = np.linspace(q.min(), q.max(), 64)
    wobble = gaussian_filter1d(rng.normal(size=64), 6)
    wobble = wobble / (np.abs(wobble).max() + 1e-9) * rng.uniform(0.5, 3.0) * step
    wobble_map = np.interp(q, q_axis, wobble)
    steps = np.clip(step * rng.normal(1.0, 0.25, size=n), 0.3 * step, None)
    edge = np.cumsum(steps)
    edge -= edge.mean()  # centre the package in the cube

    # build surfaces oldest -> youngest
    z = np.empty((nx, ny, n))
    for t in range(n):
        u = s - edge[t] - wobble_map
        z[..., t] = clinoform_profile(u, relief, width) - aggr * t
    # a falling shelf edge (negative aggradation) can put a younger surface below an
    # older one: there is no deposition, so it follows the older surface (offlap)
    z = np.minimum.accumulate(z, axis=2)
    erosion_surface = None
    if erosion is None:
        erosion = bool(rng.random() < 0.5)
    if erosion:
        frac = rng.uniform(0.3, 0.7) if erosion_position is None else erosion_position
        te = int(np.clip(round(n * frac), 1, n - 2))
        cut_max = metres_to_samples(
            rng.uniform(8.0, 30.0) if erosion_depth_m is None else erosion_depth_m,
            digi,
            infill,
        )
        nv = int(rng.integers(0, 4)) if n_valleys is None else int(n_valleys)
        valley_depth = metres_to_samples(
            rng.uniform(15.0, 60.0) if valley_depth_m is None else valley_depth_m,
            digi,
            infill,
        )
        u_te = s - edge[te] - wobble_map  # position relative to the shelf edge then
        # shelf-top weight: 1 on the topset, fading to 0 over the upper foreset
        cut = cut_max * (1.0 - _smoothstep(u_te / (0.6 * width)))
        for _ in range(nv):
            q0 = rng.uniform(0.7 * q.min(), 0.7 * q.max())
            sigma = rng.uniform(300.0, 900.0) / bin_size  # valley half-width (cells)
            wavelength = rng.uniform(15.0, 40.0) * sigma
            amp = rng.uniform(0.0, 2.0) * sigma
            phase = rng.uniform(0.0, 2.0 * np.pi)
            centre = q0 + amp * np.sin(2.0 * np.pi * s / wavelength + phase)
            # valleys continue further down the foreset than the general cut
            reach = 1.0 - _smoothstep(u_te / (0.95 * width))
            cut = cut + valley_depth * reach * np.exp(-0.5 * ((q - centre) / sigma) ** 2)
        erosion_surface = z[..., te] + cut  # deeper than the seabed of that time
        drop = metres_to_samples(
            rng.uniform(2.0, 8.0) if stepdown_m is None else stepdown_m, digi, infill
        )
        z_old = z.copy()
        for t in range(te + 1):
            z[..., t] = np.maximum(z_old[..., t], erosion_surface)  # truncation
        # level of the first younger topset: the erosion surface at the old shelf edge
        centre = np.argmin((s - edge[te]) ** 2 + q**2)
        level = erosion_surface.flat[centre]
        for t in range(te + 1, n):
            k = t - te - 1
            # the lowstand wedge progrades faster than the older package, which
            # leaves long horizontal topsets between the steps
            wedge_edge = edge[te] + 2.0 * (edge[t] - edge[te])
            u = s - wedge_edge - wobble_map
            # horizontal topset at this level (stepping down by `drop` each time),
            # then a foreset that descends until it meets the erosion surface
            surface = (level + k * drop) + clinoform_profile(u, relief, width)
            surface = np.minimum(surface, erosion_surface)  # downlap / onlap on it
            z[..., t] = np.minimum(surface, z[..., t - 1])  # start on the previous foreset
    z = gaussian_filter(z, sigma=(0.7, 0.7, 0))
    if erosion_surface is not None:
        erosion_surface = gaussian_filter(erosion_surface, sigma=0.7)
    # height above the deepest point (the basin floor); non-negative
    z_floor = z.max()
    d = z_floor - z
    d = np.maximum.accumulate(d, axis=2)  # guard against smoothing round-off
    if return_erosion:
        e = None if erosion_surface is None else z_floor - erosion_surface
        return d, e
    return d


def insert_package(maps, layer, package):
    """Insert the clinoform surfaces into `maps` (nx, ny, nlayers) above horizon
    `layer`, which becomes the flat basin floor the clinoforms downlap onto. The
    layer between the floor and the oldest clinoform is the older shelf wedge.

    Horizons shallower than the package are pushed up where they would cross it
    (thickness clipped to zero), as for fans. Returns the new stack."""
    n = package.shape[2]
    nx, ny, nl = maps.shape
    new = np.zeros((nx, ny, nl + n))
    new[..., :layer] = maps[..., :layer]
    base = maps[..., layer]
    # package surfaces shallow -> deep: youngest first
    for k in range(n):
        new[..., layer + k] = base - package[..., n - 1 - k]
    new[..., layer + n] = base  # basin floor
    new[..., layer + n + 1 :] = maps[..., layer + 1 :]
    # shallower horizons may not lie below the youngest clinoform
    for i in range(layer - 1, -1, -1):
        new[..., i] = np.minimum(new[..., i], new[..., i + 1])
    return new
