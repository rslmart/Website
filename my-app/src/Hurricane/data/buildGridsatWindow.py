"""Crop two GridSat-B1 windows and resample them onto Web Mercator.

Sandy 2012296N14283 at 2012-10-30 09:00 UTC and Matthew 2016273N13300 at
2016-10-03 00:00 UTC. Each window is 301 by 301 cells of the file's 0.07°
grid, about 1,100 km from the center. The output pixels are evenly spaced
in EPSG:3857 and the stored bounds are centered on the source-grid cell in
that projection, so a deck.gl BitmapLayer can draw the JPEG with those
bounds unchanged.

The global NetCDF is not kept. Run with:

    uv run --with netCDF4 --with numpy --with pillow --with matplotlib \
        python buildGridsatWindow.py
"""

import argparse
import json
import math
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "..", "..", "public", "hurricane", "gridsat")

# NCEI HTTPS access, then the NOAA Open Data bucket that holds the same
# GRIDSAT-B1.YYYY.MM.DD.HH.v02r01.nc objects when that access path 404s.
ACCESS_URL = (
    "https://www.ncei.noaa.gov/data/"
    "geostationary-ir-channel-brightness-temperature-gridsat-b1/access/"
    "{year}/{name}"
)
NODD_URL = "https://noaa-cdr-gridsat-b1-pds.s3.amazonaws.com/data/{year}/{name}"

# Same enhancement as buildHursatImages.py: 190–300 K, matplotlib turbo_r.
IR_VMIN = 190.0
IR_VMAX = 300.0
WINDOW = 301
CENTER = WINDOW // 2  # pixel 150 of a 301-pixel image

# EPSG:3857 sphere.
R_M = 6378137.0

STORMS = (
    {
        "sid": "2012296N14283",
        "track_time": "2012-10-30 09:00:00",
        "lat": 40.0,
        "lon": -77.0,
        "name": "GRIDSAT-B1.2012.10.30.09.v02r01.nc",
        "year": 2012,
    },
    {
        "sid": "2016273N13300",
        "track_time": "2016-10-03 00:00:00",
        "lat": 14.5,
        "lon": -75.0,
        "name": "GRIDSAT-B1.2016.10.03.00.v02r01.nc",
        "year": 2016,
    },
)


def _imaging():
    import numpy as np
    import netCDF4 as nc
    import matplotlib as mpl
    from PIL import Image

    return np, nc, mpl, Image


def merc_y(lat_deg):
    phi = math.radians(lat_deg)
    return math.log(math.tan(math.pi / 4 + phi / 2))


def inv_merc_y(y):
    return math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)


def _curl(url, dest):
    cmd = [
        "curl", "-fsSL", "--retry", "2", "--retry-delay", "2",
        "--max-time", "180", "-A", "gridsat-window/1.0", "-o", dest, url,
    ]
    subprocess.run(cmd, check=True)


def download(storm, dest):
    """Fetch one GridSat file. The access URL is tried first."""
    name = storm["name"]
    year = storm["year"]
    access = ACCESS_URL.format(year=year, name=name)
    nodd = NODD_URL.format(year=year, name=name)
    try:
        _curl(access, dest)
        return access
    except subprocess.CalledProcessError:
        _curl(nodd, dest)
        return nodd


def file_time(nc, ds):
    """Nominal grid time. The scan window can run about 30 minutes past it."""
    var = ds.variables["time"]
    when = nc.num2date(var[:][0], var.units, getattr(var, "calendar", "standard"))
    return (
        f"{when.year:04d}-{when.month:02d}-{when.day:02d} "
        f"{when.hour:02d}:{when.minute:02d}:{when.second:02d}"
    )


def stamp_of(gridsat_time):
    # "2012-10-30 09:00:00" -> 201210300900
    digits = gridsat_time.replace("-", "").replace(":", "").replace(" ", "")
    return digits[:12]


def nearest_cell(np, axis, value):
    index = int(np.argmin(np.abs(axis - value)))
    return index, float(axis[index])


def read_window(np, nc, path, track_lat, track_lon):
    ds = nc.Dataset(path)
    try:
        gridsat_time = file_time(nc, ds)
        lat = np.array(ds.variables["lat"][:], dtype=np.float64)
        lon = np.array(ds.variables["lon"][:], dtype=np.float64)
        i_c, lat_c = nearest_cell(np, lat, track_lat)
        j_c, lon_c = nearest_cell(np, lon, track_lon)
        cell_lat = float(lat[i_c] - lat[i_c - 1])
        cell_lon = float(lon[j_c] - lon[j_c - 1])
        pad = 2
        i0 = max(0, i_c - CENTER - pad)
        i1 = min(lat.size, i_c + CENTER + 1 + pad)
        j0 = max(0, j_c - CENTER - pad)
        j1 = min(lon.size, j_c + CENTER + 1 + pad)
        # valid_range is in Kelvin, but it is stored on the packed variable.
        # netCDF4 would mask every packed value outside 140–375, which is
        # almost the whole grid. Scale and mask the fill value ourselves.
        var = ds.variables["irwin_cdr"]
        var.set_auto_maskandscale(False)
        packed = np.array(var[0, i0:i1, j0:j1])
        scale = float(getattr(var, "scale_factor", 1.0))
        offset = float(getattr(var, "add_offset", 0.0))
        fill = int(getattr(var, "_FillValue"))
        grid = packed.astype(np.float64) * scale + offset
        grid[packed == fill] = np.nan
        if hasattr(var, "valid_range"):
            lo, hi = (float(x) for x in var.valid_range)
            grid[(grid < lo) | (grid > hi)] = np.nan
        slab_lat = lat[i0:i1]
        slab_lon = lon[j0:j1]
    finally:
        ds.close()
    return {
        "gridsat_time": gridsat_time,
        "lat_c": lat_c,
        "lon_c": lon_c,
        "cell_lat": cell_lat,
        "cell_lon": cell_lon,
        "grid": grid,
        "slab_lat": slab_lat,
        "slab_lon": slab_lon,
    }


def output_axes(lat_c, lon_c, cell_lat, cell_lon):
    """Pixel centers, north-up, and the geographic edges of those pixels.

    Longitude is linear. Latitude is spaced evenly in Web Mercator, using
    the local size of one source cell at the center so a north-south step
    keeps its ground length. The center pixel is the source-grid cell.
    """
    np, _nc, _mpl, _image = _imaging()
    dy = math.radians(cell_lat) / math.cos(math.radians(lat_c))
    y_c = merc_y(lat_c)
    rows = np.arange(WINDOW, dtype=np.float64)
    cols = np.arange(WINDOW, dtype=np.float64)
    lats = inv_merc_array(y_c + (CENTER - rows) * dy)
    lons = lon_c + (cols - CENTER) * cell_lon
    lats[CENTER] = lat_c
    lons[CENTER] = lon_c
    half_y = (WINDOW / 2) * dy
    half_x = (WINDOW / 2) * cell_lon
    bounds = [
        lon_c - half_x,
        inv_merc_y(y_c - half_y),
        lon_c + half_x,
        inv_merc_y(y_c + half_y),
    ]
    return lats, lons, bounds


def inv_merc_array(y):
    np, _nc, _mpl, _image = _imaging()
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def bilinear(grid, lat_axis, lon_axis, lats, lons):
    np, _nc, _mpl, _image = _imaging()
    lat0 = float(lat_axis[0])
    lon0 = float(lon_axis[0])
    dlat = float(lat_axis[1] - lat_axis[0])
    dlon = float(lon_axis[1] - lon_axis[0])
    fi = (lats - lat0) / dlat
    fj = (lons - lon0) / dlon
    i0 = np.clip(np.floor(fi).astype(np.int32), 0, grid.shape[0] - 2)
    j0 = np.clip(np.floor(fj).astype(np.int32), 0, grid.shape[1] - 2)
    wi = (fi - i0)[:, None]
    wj = (fj - j0)[None, :]
    g00 = grid[i0[:, None], j0[None, :]]
    g01 = grid[i0[:, None], j0[None, :] + 1]
    g10 = grid[i0[:, None] + 1, j0[None, :]]
    g11 = grid[i0[:, None] + 1, j0[None, :] + 1]
    samples = (g00, g01, g10, g11)
    raw_w = ((1 - wi) * (1 - wj), (1 - wi) * wj, wi * (1 - wj), wi * wj)
    total = np.zeros(g00.shape, dtype=np.float64)
    total_w = np.zeros(g00.shape, dtype=np.float64)
    for sample, weight in zip(samples, raw_w):
        finite = np.isfinite(sample)
        ww = np.where(finite, weight, 0.0)
        total += np.where(finite, sample, 0.0) * ww
        total_w += ww
    return np.where(total_w > 0, total / total_w, np.nan)


def colorize(kelvin):
    np, _nc, mpl, _image = _imaging()
    lut = (mpl.colormaps["turbo_r"](np.linspace(0, 1, 256))[:, :3] * 255).astype(np.uint8)
    filled = np.where(np.isfinite(kelvin), kelvin, IR_VMAX)
    idx = np.clip((filled - IR_VMIN) / (IR_VMAX - IR_VMIN), 0, 1)
    return lut[(idx * 255).astype(np.uint8)]


def write_jpeg(rgb, path):
    _np, _nc, _mpl, Image = _imaging()
    img = Image.fromarray(rgb, "RGB")
    img.save(path, format="JPEG", quality=82)


def build_one(storm, nc_path):
    np, nc, _mpl, _image = _imaging()
    window = read_window(np, nc, nc_path, storm["lat"], storm["lon"])
    lats, lons, bounds = output_axes(
        window["lat_c"], window["lon_c"], window["cell_lat"], window["cell_lon"]
    )
    sampled = bilinear(window["grid"], window["slab_lat"], window["slab_lon"], lats, lons)
    rgb = colorize(sampled)
    stamp = stamp_of(window["gridsat_time"])
    image = f"{storm['sid']}-{stamp}.jpg"
    return {
        "sid": storm["sid"],
        "trackTime": storm["track_time"],
        "gridsatTime": window["gridsat_time"],
        "image": image,
        "bounds": bounds,
        "rgb": rgb,
        "lat_c": window["lat_c"],
        "lon_c": window["lon_c"],
        "center_k": float(sampled[CENTER, CENTER]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        help="Directory of already downloaded NetCDF files. Skips the download.",
    )
    parser.add_argument("--out", default=OUT_DIR)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    frames = []
    for storm in STORMS:
        if args.source_dir:
            nc_path = os.path.join(args.source_dir, storm["name"])
            frame = build_one(storm, nc_path)
        else:
            with tempfile.TemporaryDirectory(prefix="gridsat_") as tmp:
                nc_path = os.path.join(tmp, storm["name"])
                download(storm, nc_path)
                frame = build_one(storm, nc_path)
        rgb = frame.pop("rgb")
        lat_c = frame.pop("lat_c")
        lon_c = frame.pop("lon_c")
        center_k = frame.pop("center_k")
        write_jpeg(rgb, os.path.join(args.out, frame["image"]))
        frames.append(frame)
        print(
            f"{frame['sid']} gridsat {frame['gridsatTime']} "
            f"cell {lat_c:.5f},{lon_c:.5f} "
            f"bounds {frame['bounds']} center {center_k:.1f} K"
        )
    manifest = {"frames": frames}
    dest = os.path.join(args.out, "frames.json")
    with open(dest, "w") as fp:
        json.dump(manifest, fp, indent=2)
        fp.write("\n")
    print(f"wrote {dest}")


if __name__ == "__main__":
    main()
