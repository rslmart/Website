"""Crop one GridSat-B1 window per storm from each occupied hour.

Download each GRIDSAT-B1.YYYY.MM.DD.HH.v02r01.nc once, cut every exact
3-hour fix in that file, then delete the NetCDF. NOAA Open Data is tried
first. The NCEI access folder is used only when that object 404s. A window
that crosses the date line is read from both edges and joined. A fill
window writes no JPEG. The scratch manifest stays next to the JPEGs.

The default --out is public/hurricane/gridsat/. Catalog crops do not belong
there; pass a directory outside the repo. Published objects, after a later
approved upload, are https://makoa.link/hurricane-gridsat/{sid}/{stamp}.jpg.
They are not part of the Vite build. Sandy, Matthew, Hugo, and Melissa keep
the frames already committed under public/hurricane/gridsat/.

    uv run --with netCDF4 --with numpy --with pillow --with matplotlib \
        python buildGridsatWindow.py \
        --dates 2023-10-20,1992-09-25 \
        --out /tmp/makoa-gridsat-slice1
"""

import argparse
import gzip
import json
import math
import os
import re
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "..", "..", "public", "hurricane", "gridsat")
STORMS_PATH = os.path.join(HERE, "..", "..", "..", "public", "hurricane", "storms.json.gz")

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
PAD = 2

# Fixed GridSat-B1 grid. Latitude from −70°, longitude from −180°, 0.07°.
CELL = 0.07
LAT0 = -70.0
LON0 = -180.0
NLAT = 2000
NLON = 5143

# EPSG:3857 sphere.
R_M = 6378137.0

DAY = re.compile(r"\d{4}-\d{2}-\d{2}$")
VERSION = "v02r01"


class NotFound(Exception):
    """The GridSat object returned HTTP 404."""


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


def wrap_lon(lon):
    """Longitude in −180..180. 180 and −180 are the same meridian."""
    x = math.fmod(lon + 180.0, 360.0)
    if x < 0.0:
        x += 360.0
    return x - 180.0


def nearest_index(origin, value, step, size, wrap):
    """Index of the closest cell. A tie keeps the lower index.

    Matches np.argmin on an ascending axis: equal distances return the
    first cell. Longitude wraps. Latitude clamps to the stored grid.
    """
    raw = (value - origin) / step
    lower = math.floor(raw)

    def at(index):
        return origin + index * step

    if abs(value - at(lower)) <= abs(value - at(lower + 1)):
        index = lower
    else:
        index = lower + 1
    if wrap:
        return index % size
    if index < 0:
        return 0
    if index >= size:
        return size - 1
    return index


def catalog_bounds(lat, lon):
    """Web Mercator edges of the 301 by 301 window around the nearest cell.

    The page uses this same placement. A point with |latitude| > 70° has
    no cell.
    """
    if abs(lat) > 70.0:
        return None
    lon = wrap_lon(lon)
    i = nearest_index(LAT0, lat, CELL, NLAT, wrap=False)
    j = nearest_index(LON0, lon, CELL, NLON, wrap=True)
    lat_c = LAT0 + i * CELL
    lon_c = LON0 + j * CELL
    dy = math.radians(CELL) / math.cos(math.radians(lat_c))
    y_c = merc_y(lat_c)
    half_y = (WINDOW / 2) * dy
    half_x = (WINDOW / 2) * CELL
    return [
        lon_c - half_x,
        inv_merc_y(y_c - half_y),
        lon_c + half_x,
        inv_merc_y(y_c + half_y),
    ]


def _curl_cmd(url, dest):
    return [
        "curl", "-fsSL", "--retry", "4", "--retry-delay", "2",
        "--retry-connrefused", "--max-time", "600",
        "-A", "gridsat-window/1.0",
        "-w", "%{http_code}",
        "-o", dest, url,
    ]


def fetch(url, dest):
    """Download one HTTPS object. HTTP 404 raises NotFound."""
    if not url.startswith("https://"):
        raise RuntimeError(f"refusing non-HTTPS URL {url}")
    proc = subprocess.run(_curl_cmd(url, dest), capture_output=True, text=True)
    code = (proc.stdout or "").strip().splitlines()
    http = code[-1] if code else ""
    if proc.returncode == 0 and http == "200":
        return
    if os.path.exists(dest):
        os.remove(dest)
    detail = (proc.stderr or "").strip()
    if http == "404" or "404" in detail:
        raise NotFound(url)
    raise RuntimeError(
        f"download failed {url} http {http or '?'} exit {proc.returncode} {detail}"
    )


def download_hour(name, year, dest):
    """NOAA Open Data first. NCEI only when that object 404s."""
    nodd = NODD_URL.format(year=year, name=name)
    try:
        fetch(nodd, dest)
        return "nodd"
    except NotFound:
        if os.path.exists(dest):
            os.remove(dest)
    access = ACCESS_URL.format(year=year, name=name)
    try:
        fetch(access, dest)
        return "ncei"
    except NotFound:
        if os.path.exists(dest):
            os.remove(dest)
        raise


def is_gridsat_hour(date_time):
    """True for 00, 03, 06, 09, 12, 15, 18, and 21 UTC exactly."""
    hour = int(date_time[11:13])
    minute = int(date_time[14:16])
    second = int(date_time[17:19])
    return second == 0 and minute == 0 and hour % 3 == 0


def hour_name(date_time):
    return (
        "GRIDSAT-B1."
        + date_time[0:4] + "." + date_time[5:7] + "." + date_time[8:10] + "."
        + date_time[11:13] + "." + VERSION + ".nc"
    )


def _check_day(text):
    if not DAY.fullmatch(text):
        raise SystemExit(f"bad date {text}")
    return text


def load_hours(storms_path, dates, start, end):
    """Exact 3-hour fixes grouped by GridSat file name.

    Two fixes for one storm in one hour share a single JPEG. Longitude is
    left as stored; the crop wraps it.
    """
    with gzip.open(storms_path, "rt") as fp:
        storms = json.load(fp)
    hours = {}
    for sid, storm in storms.items():
        seen = set()
        for point in storm["track_points"]:
            when = point["date_time"]
            if not is_gridsat_hour(when):
                continue
            day = when[:10]
            if dates is not None and day not in dates:
                continue
            if start and day < start:
                continue
            if end and day > end:
                continue
            name = hour_name(when)
            if (name, sid) in seen:
                continue
            seen.add((name, sid))
            hours.setdefault(name, []).append({
                "sid": sid,
                "track_time": when,
                "lat": float(point["latitude"]),
                "lon": float(point["longitude"]),
                "name": name,
                "year": int(when[0:4]),
            })
    for fixes in hours.values():
        fixes.sort(key=lambda fix: fix["sid"])
    return hours


def haversine_km(lat1, lon1, lat2, lon2):
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = phi2 - phi1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2.0) ** 2
    return 2.0 * R_M * math.asin(math.sqrt(a)) / 1000.0


def jpeg_markers(path):
    """True when the file starts and ends with JPEG markers."""
    if not os.path.isfile(path) or os.path.getsize(path) < 4:
        return False
    with open(path, "rb") as fp:
        head = fp.read(2)
        fp.seek(-2, os.SEEK_END)
        tail = fp.read(2)
    return head == b"\xff\xd8" and tail == b"\xff\xd9"


def load_manifest(path):
    if not os.path.isfile(path):
        return {}
    with open(path) as fp:
        body = json.load(fp)
    hours = body.get("hours", {})
    return hours if isinstance(hours, dict) else {}


def write_manifest(path, hours):
    tmp = path + ".part"
    with open(tmp, "w") as fp:
        json.dump({"hours": hours}, fp, indent=2)
        fp.write("\n")
    os.replace(tmp, path)


def frames_ready(out, frames):
    if not frames:
        return False
    return all(jpeg_markers(os.path.join(out, rel)) for rel in frames)


def file_time(nc, ds):
    """Nominal grid time. The scan window can run about 30 minutes past it."""
    var = ds.variables["time"]
    when = nc.num2date(var[:][0], var.units, getattr(var, "calendar", "standard"))
    return (
        f"{int(when.year):04d}-{int(when.month):02d}-{int(when.day):02d} "
        f"{int(when.hour):02d}:{int(when.minute):02d}:{int(when.second):02d}"
    )


def stamp_of(gridsat_time):
    # "2012-10-30 09:00:00" -> 201210300900
    digits = gridsat_time.replace("-", "").replace(":", "").replace(" ", "")
    return digits[:12]


def axis_step(axis, index):
    if index > 0:
        step = float(axis[index] - axis[index - 1])
    elif axis.size > 1:
        step = float(axis[1] - axis[0])
    else:
        step = CELL
    if step == 0.0:
        return CELL
    return abs(step)


def _unwrap(np, values, origin):
    delta = (values - origin + 180.0) % 360.0 - 180.0
    return origin + delta


def read_window_ds(np, nc, ds, track_lat, track_lon):
    """301-cell neighborhood. A window past either longitude edge is joined."""
    track_lon = wrap_lon(track_lon)
    if abs(track_lat) > 70.0:
        return None
    gridsat_time = file_time(nc, ds)
    lat = np.array(ds.variables["lat"][:], dtype=np.float64)
    lon = np.array(ds.variables["lon"][:], dtype=np.float64)
    i_c = int(np.argmin(np.abs(lat - track_lat)))
    lon_delta = (lon - track_lon + 180.0) % 360.0 - 180.0
    j_c = int(np.argmin(np.abs(lon_delta)))
    lat_c = float(lat[i_c])
    lon_c = float(lon[j_c])
    cell_lat = axis_step(lat, i_c)
    cell_lon = axis_step(lon, j_c)
    nlat = int(lat.size)
    nlon = int(lon.size)
    i_lo = max(0, i_c - (CENTER + PAD))
    i_hi = min(nlat, i_c + (CENTER + PAD) + 1)
    j_lo = j_c - (CENTER + PAD)
    j_hi = j_c + (CENTER + PAD)
    var = ds.variables["irwin_cdr"]
    var.set_auto_maskandscale(False)
    if j_lo >= 0 and j_hi < nlon:
        packed = np.array(var[0, i_lo:i_hi, j_lo:j_hi + 1])
        raw_lon = lon[j_lo:j_hi + 1]
    else:
        # One contiguous slice stops at the array edge and drops the other
        # side of the date line. Read both edges, in window order.
        cols = np.array([j % nlon for j in range(j_lo, j_hi + 1)], dtype=np.int64)
        rows = np.array(var[0, i_lo:i_hi, :])
        packed = rows[:, cols]
        raw_lon = lon[cols]
    scale = float(getattr(var, "scale_factor", 1.0))
    offset = float(getattr(var, "add_offset", 0.0))
    grid = packed.astype(np.float64) * scale + offset
    fill = getattr(var, "_FillValue", None)
    if fill is not None:
        grid[packed == fill] = np.nan
    if hasattr(var, "valid_range"):
        lo, hi = (float(x) for x in var.valid_range)
        grid[(grid < lo) | (grid > hi)] = np.nan
    slab_lon = _unwrap(np, np.array(raw_lon, dtype=np.float64), lon_c)
    if slab_lon.size > 1 and np.any(np.diff(slab_lon) <= 0):
        raise RuntimeError(f"longitude window is not increasing at {lon_c}")
    return {
        "gridsat_time": gridsat_time,
        "lat_c": lat_c,
        "lon_c": lon_c,
        "cell_lat": cell_lat,
        "cell_lon": cell_lon,
        "grid": grid,
        "slab_lat": lat[i_lo:i_hi],
        "slab_lon": slab_lon,
    }


def read_window(np, nc, path, track_lat, track_lon):
    ds = nc.Dataset(path)
    try:
        return read_window_ds(np, nc, ds, track_lat, track_lon)
    finally:
        ds.close()


def output_axes(lat_c, lon_c, cell_lat, cell_lon):
    """Pixel centers, north-up, and the geographic edges of those pixels.

    Longitude is linear and may leave −180..180 when the window crosses the
    date line. Latitude is spaced evenly in Web Mercator. The center pixel
    is the source-grid cell.
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
    lat_axis = np.asarray(lat_axis, dtype=np.float64)
    lon_axis = np.asarray(lon_axis, dtype=np.float64)
    if lat_axis.size < 2 or lon_axis.size < 2:
        return np.full((lats.size, lons.size), np.nan)
    dlat = float(lat_axis[1] - lat_axis[0])
    if dlat == 0.0:
        return np.full((lats.size, lons.size), np.nan)
    fi = (lats - float(lat_axis[0])) / dlat
    fj = np.interp(lons, lon_axis, np.arange(lon_axis.size, dtype=np.float64))
    if dlat > 0:
        inside_i = (lats >= lat_axis[0]) & (lats <= lat_axis[-1])
    else:
        inside_i = (lats <= lat_axis[0]) & (lats >= lat_axis[-1])
    inside_j = (lons >= lon_axis[0]) & (lons <= lon_axis[-1])
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
    sampled = np.full(g00.shape, np.nan, dtype=np.float64)
    np.divide(total, total_w, out=sampled, where=total_w > 0)
    sampled[~inside_i[:, None] | ~inside_j[None, :]] = np.nan
    return sampled


def colorize(kelvin):
    np, _nc, mpl, _image = _imaging()
    lut = (mpl.colormaps["turbo_r"](np.linspace(0, 1, 256))[:, :3] * 255).astype(np.uint8)
    filled = np.where(np.isfinite(kelvin), kelvin, IR_VMAX)
    idx = np.clip((filled - IR_VMIN) / (IR_VMAX - IR_VMIN), 0, 1)
    return lut[(idx * 255).astype(np.uint8)]


def write_jpeg(rgb, path):
    _np, _nc, _mpl, Image = _imaging()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.fromarray(rgb, "RGB")
    tmp = path + ".part"
    img.save(tmp, format="JPEG", quality=82)
    os.replace(tmp, path)


def crop_fix(np, nc, ds, fix):
    """One JPEG's pixels, or None when the fix has no cell or the window is fill."""
    window = read_window_ds(np, nc, ds, fix["lat"], fix["lon"])
    if window is None:
        return None
    lats, lons, _bounds = output_axes(
        window["lat_c"], window["lon_c"], window["cell_lat"], window["cell_lon"]
    )
    sampled = bilinear(window["grid"], window["slab_lat"], window["slab_lon"], lats, lons)
    if not np.isfinite(sampled).any():
        return None
    stamp = stamp_of(fix["track_time"])
    file_stamp = stamp_of(window["gridsat_time"])
    if file_stamp != stamp:
        raise SystemExit(
            f"{fix['name']} grid time {window['gridsat_time']} "
            f"does not match track time {fix['track_time']}"
        )
    center = sampled[CENTER, CENTER]
    center_k = float(center) if np.isfinite(center) else float("nan")
    center_km = haversine_km(
        window["lat_c"], window["lon_c"], fix["lat"], wrap_lon(fix["lon"])
    )
    return {
        "rgb": colorize(sampled),
        "stamp": stamp,
        "center_km": center_km,
        "center_k": center_k,
    }


def process_hour(name, fixes, out, source_dir, manifest, manifest_path, recheck_absent):
    """Download one file, crop every fix, delete the NetCDF, record the hour."""
    record = manifest.get(name) or {}
    status = record.get("status")
    if status == "complete" and frames_ready(out, record.get("frames") or []):
        print(f"skip complete {name} {len(record['frames'])}", flush=True)
        return "complete"
    if status == "empty":
        print(f"skip empty {name}", flush=True)
        return "empty"
    if status == "absent" and not recheck_absent:
        print(f"skip absent {name}", flush=True)
        return "absent"

    delete_nc = False
    if source_dir:
        nc_path = os.path.join(source_dir, name)
        if not os.path.isfile(nc_path):
            raise SystemExit(f"missing local NetCDF {nc_path}")
        source = "local"
    else:
        fd, nc_path = tempfile.mkstemp(prefix="gridsat_", suffix=".nc")
        os.close(fd)
        delete_nc = True
        year = int(name.split(".")[1])
        try:
            source = download_hour(name, year, nc_path)
        except NotFound:
            if os.path.exists(nc_path):
                os.remove(nc_path)
            manifest[name] = {"status": "absent", "frames": []}
            write_manifest(manifest_path, manifest)
            print(f"absent {name}", flush=True)
            return "absent"

    # Size is only a log line. A few MB can still hold a scene, so open it.
    print(f"open {name} {os.path.getsize(nc_path)} {source}", flush=True)
    np, nc, _mpl, _image = _imaging()
    frames = []
    any_scene = False
    try:
        ds = nc.Dataset(nc_path)
        try:
            for fix in fixes:
                stamp = stamp_of(fix["track_time"])
                rel = f"{fix['sid']}/{stamp}.jpg"
                path = os.path.join(out, fix["sid"], stamp + ".jpg")
                if abs(fix["lat"]) > 70.0:
                    print(f"no-cell {fix['sid']} {stamp}", flush=True)
                    continue
                if jpeg_markers(path):
                    frames.append(rel)
                    any_scene = True
                    print(f"keep {rel}", flush=True)
                    continue
                built = crop_fix(np, nc, ds, fix)
                if built is None:
                    print(f"fill {fix['sid']} {stamp}", flush=True)
                    continue
                write_jpeg(built["rgb"], path)
                frames.append(rel)
                any_scene = True
                print(
                    f"{fix['sid']} {stamp} center {built['center_km']:.3f} km "
                    f"{built['center_k']:.1f} K",
                    flush=True,
                )
        finally:
            ds.close()
    finally:
        if delete_nc and os.path.exists(nc_path):
            os.remove(nc_path)

    if any_scene:
        manifest[name] = {"status": "complete", "source": source, "frames": frames}
        print(f"complete {name} {len(frames)} {source}", flush=True)
        write_manifest(manifest_path, manifest)
        return "complete"
    manifest[name] = {"status": "empty", "source": source, "frames": []}
    print(f"empty {name} {source}", flush=True)
    write_manifest(manifest_path, manifest)
    return "empty"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", help="Directory of NetCDF files. Skips the download.")
    parser.add_argument("--storms", default=STORMS_PATH)
    parser.add_argument("--out", default=OUT_DIR)
    parser.add_argument("--dates", help="Comma-separated YYYY-MM-DD days.")
    parser.add_argument("--from-date", dest="from_date", help="First day, inclusive.")
    parser.add_argument("--to-date", dest="to_date", help="Last day, inclusive.")
    parser.add_argument(
        "--recheck-absent",
        action="store_true",
        help="Try hours recorded absent again. They are skipped otherwise.",
    )
    args = parser.parse_args(argv)
    dates = None
    if args.dates:
        dates = {_check_day(part.strip()) for part in args.dates.split(",") if part.strip()}
    start = _check_day(args.from_date) if args.from_date else None
    end = _check_day(args.to_date) if args.to_date else None
    if not dates and not start and not end:
        raise SystemExit("pass --dates or --from-date/--to-date")
    args.dates = dates
    args.from_date = start
    args.to_date = end
    return args


def main(argv=None):
    args = parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    hours = load_hours(args.storms, args.dates, args.from_date, args.to_date)
    manifest_path = os.path.join(args.out, "manifest.json")
    manifest = load_manifest(manifest_path)
    counts = {"complete": 0, "empty": 0, "absent": 0}
    frame_count = 0
    for name in sorted(hours):
        status = process_hour(
            name, hours[name], args.out, args.source_dir,
            manifest, manifest_path, args.recheck_absent,
        )
        counts[status] = counts.get(status, 0) + 1
        if status == "complete":
            frame_count += len(manifest[name].get("frames") or [])
    print(
        f"summary hours={len(hours)} complete={counts['complete']} "
        f"empty={counts['empty']} absent={counts['absent']} frames={frame_count}",
        flush=True,
    )
    print(f"wrote {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
