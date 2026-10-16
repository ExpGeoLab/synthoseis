"""Prototype: render a clinoform package inserted into a horizon stack.

Run:  python prototypes/clinoform_prototype.py [out.png] [seed]
The generator itself lives in datagenerator/clinoforms.py.
"""

import sys

import numpy as np
from scipy.ndimage import gaussian_filter

from datagenerator.clinoforms import DIGI, INFILL, clinoform_package, insert_package


def background_stack(nx, ny, n_layers=40, thickness=55.0, rng=None):
    """Gently dipping stack of horizons with a little noise (infilled samples)."""
    rng = np.random.default_rng() if rng is None else rng
    base = np.zeros((nx, ny))
    gx, gy = rng.uniform(-0.02, 0.02, size=2)
    xx, yy = np.meshgrid(np.arange(nx), np.arange(ny), indexing="ij")
    maps = np.zeros((nx, ny, n_layers))
    z = 2000.0 + gx * xx + gy * yy
    for k in range(n_layers):
        maps[..., k] = z
        z = z + thickness * rng.uniform(0.6, 1.4) + gaussian_filter(
            rng.normal(0.0, 3.0, size=(nx, ny)), 8
        )
    return maps


def impedance_section(maps, line, nz=None, rng=None, facies=None):
    """Fill layers of a 2D section with impedance and make a synthetic trace
    panel: returns (impedance, seismic) at the work-cube sampling."""
    from datagenerator.wavelets import ricker

    rng = np.random.default_rng() if rng is None else rng
    sect = maps[line]  # (ny, nlayers)
    ny, nl = sect.shape
    nz = int(sect.max()) + 200 if nz is None else nz
    layer_imp = rng.choice([0.0, 1.0], size=nl) if facies is None else facies
    imp = np.zeros((ny, nz))
    zs = np.arange(nz)
    for j in range(ny):
        idx = np.searchsorted(sect[j], zs, side="right") - 1
        imp[j] = 4500.0 + 700.0 * layer_imp[np.clip(idx, 0, nl - 1)]
        imp[j, zs < sect[j, 0]] = 2600.0  # water
    refl = np.diff(imp, axis=1) / (imp[:, 1:] + imp[:, :-1])
    # Ricker at 30 Hz on the 0.4 ms work grid
    _, w = ricker(30.0, DIGI / INFILL, convolutions=1)
    seis = np.array([np.convolve(r, w, mode="same") for r in refl])
    return imp, seis


def main(out_png="clinoform_prototype.png", seed=0):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    rng = np.random.default_rng(seed)
    nx = ny = 300
    maps = background_stack(nx, ny, rng=rng)
    pkg = clinoform_package(nx, ny, azimuth=90.0, rng=rng)  # along the section
    stack = insert_package(maps, 20, pkg)

    thickness = np.diff(stack, axis=2)
    print("stack", stack.shape, "min layer thickness", thickness.min())
    assert thickness.min() >= -1e-6, "surfaces cross"

    total = pkg[..., -1] - pkg[..., 0]  # clinoform package thickness map
    print("package thickness max (samples)", total.max(), "~ m", total.max() * DIGI / INFILL)

    # progradation line = row of the cube along which the package varies most
    line = nx // 2
    fig, axs = plt.subplots(2, 2, figsize=(14, 10))
    ax = axs[0, 0]
    for k in range(stack.shape[2]):
        c = "r" if 20 <= k < 20 + pkg.shape[2] else "k"
        ax.plot(stack[line, :, k], c, lw=0.4)
    ax.invert_yaxis()
    ax.set_title(f"horizons, inline {line} (red = clinoforms)")

    ax = axs[0, 1]
    im = ax.imshow(total.T, cmap="viridis")
    plt.colorbar(im, ax=ax, label="package thickness (samples)")
    ax.set_title("clinoform package thickness")

    imp, seis = impedance_section(stack, line, rng=rng)
    z0, z1 = int(stack[line, :, 10].min()), int(stack[line, :, :].max())
    ax = axs[1, 0]
    ax.imshow(imp.T[z0:z1], aspect="auto", cmap="viridis")
    ax.set_title("impedance (random sand/shale layers)")
    ax = axs[1, 1]
    vmax = np.percentile(np.abs(seis), 99)
    ax.imshow(seis.T[z0:z1], aspect="auto", cmap="gray", vmin=-vmax, vmax=vmax)
    ax.set_title("synthetic seismic, 30 Hz Ricker")
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    print("wrote", out_png)


if __name__ == "__main__":
    main(
        sys.argv[1] if len(sys.argv) > 1 else "clinoform_prototype.png",
        int(sys.argv[2]) if len(sys.argv) > 2 else 0,
    )
