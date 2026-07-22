"""Render HURSAT-B1 infrared imagery and upload it to S3 for the Hurricane page.

HURSAT-B1 (https://www.ncei.noaa.gov/products/hurricane-satellite-data) provides
3-hourly, storm-centered geostationary IR grids for 1978-2015. RAMMB/CIRA only
covers 2016+, so this fills the historical gap. To keep the volume manageable we
only render storms that are notable: Category 3+ (>= 96 kt) or that made landfall.

For each qualifying storm we:
  1. download the per-storm tarball from the NCEI archive,
  2. group the .nc files by synoptic time and keep the lowest view-zenith-angle
     satellite for each time,
  3. colorize the IRWIN (window IR, Kelvin) grid into a JPEG, and
  4. upload it to s3://makoa.link/hurricane-ir/<sid>/<YYYYMMDDHHMM>.jpg
     (publicly served via CloudFront at https://makoa.link/hurricane-ir/...).

The storm-detail panel builds the same key on the fly, snapping each track point
to the nearest synoptic frame, so no manifest is needed on the client.

The job is resumable: completed SIDs are recorded in hursat_manifest.json and
skipped on re-run. Run with `uv`:

    uv run --with boto3 --with netCDF4 --with numpy --with pillow --with matplotlib \
        python buildHursatImages.py

Useful flags: --sids 2005236N23285 (test one), --limit N, --workers N, --dry-run.
"""

import argparse
import gzip
import io
import json
import os
import re
import subprocess
import tarfile
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import netCDF4 as nc
import matplotlib as mpl
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
STORMS_PATH = os.path.join(HERE, "..", "..", "..", "public", "hurricane", "storms.json.gz")
MANIFEST_PATH = os.path.join(HERE, "hursat_manifest.json")

ARCHIVE_BASE = "https://www.ncei.noaa.gov/data/hurricane-satellite-hursat-b1/archive/v06"

S3_BUCKET = "makoa.link"
S3_PREFIX = "hurricane-ir"
S3_PROFILE = "makoa"

# Category 3 on the Saffir-Simpson scale starts at 96 kt.
MAJOR_WIND_KT = 96
MIN_YEAR = 1978  # HURSAT-B1 coverage start
MAX_YEAR = 2015  # HURSAT-B1 coverage end (RAMMB takes over in 2016)

# IR enhancement: coldest cloud tops (deep convection) map to the warm end of
# turbo_r, warm ocean to blue. vmin/vmax in Kelvin.
IR_VMIN = 190.0
IR_VMAX = 300.0
_LUT = (mpl.colormaps["turbo_r"](np.linspace(0, 1, 256))[:, :3] * 255).astype(np.uint8)

# {sid}.{NAME}.{YYYY}.{MM}.{DD}.{HHMM}.{sat_idx}.{SAT}.{VZA}.hursat-b1.v06.nc
_NC_RE = re.compile(
    r"^(?P<sid>[^.]+)\.(?P<name>[^.]+)\."
    r"(?P<y>\d{4})\.(?P<mo>\d{2})\.(?P<d>\d{2})\.(?P<hm>\d{4})\."
    r"(?P<satidx>\d+)\.(?P<sat>[^.]+)\.(?P<vza>\d+)\.hursat-b1\.v06\.nc$"
)

_print_lock = threading.Lock()
_manifest_lock = threading.Lock()
_year_cache = {}
_year_cache_lock = threading.Lock()
# HDF5/netCDF4 is not thread-safe; serialize all Dataset access across workers.
_nc_lock = threading.Lock()


def log(msg):
    with _print_lock:
        print(msg, flush=True)


def load_storms():
    with gzip.open(STORMS_PATH, "rb") as fp:
        return json.loads(fp.read().decode("utf-8"))


def qualifies(storm):
    season = storm.get("season", 0)
    if season < MIN_YEAR or season > MAX_YEAR:
        return False
    if storm.get("max_wind", 0) >= MAJOR_WIND_KT:
        return True
    return "L" in storm.get("record_type_list", [])


def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH) as fp:
            return json.load(fp)
    return {}


def save_manifest_entry(manifest, sid, count):
    with _manifest_lock:
        manifest[sid] = {"count": count, "ts": int(time.time())}
        tmp = MANIFEST_PATH + ".tmp"
        with open(tmp, "w") as fp:
            json.dump(manifest, fp)
        os.replace(tmp, MANIFEST_PATH)


def _curl(url, out_path=None, timeout=300):
    """Fetch via curl. Returns text when out_path is None, else writes to file.

    urllib hangs behind some proxies; curl is reliable and ships with macOS.
    """
    cmd = ["curl", "-sSL", "--fail", "--retry", "3", "--retry-delay", "2",
           "--max-time", str(timeout), "-A", "hursat-render/1.0"]
    if out_path:
        cmd += ["-o", out_path, url]
        subprocess.run(cmd, check=True, capture_output=True)
        return None
    res = subprocess.run(cmd + [url], check=True, capture_output=True)
    return res.stdout.decode("utf-8", "replace")


def fetch_year_index(year):
    """Return {sid: tarball_url} for an archive year, cached.

    The archive is organized by the SID-prefix (genesis) year, which for some
    Southern-Hemisphere storms differs from the IBTrACS season. Missing years
    (e.g. before 1978) return an empty index rather than raising.
    """
    with _year_cache_lock:
        if year in _year_cache:
            return _year_cache[year]
    url = f"{ARCHIVE_BASE}/{year}/"
    try:
        html = _curl(url, timeout=120)
    except subprocess.CalledProcessError:
        with _year_cache_lock:
            _year_cache[year] = {}
        return {}
    mapping = {}
    for fname in re.findall(r'href="(HURSAT_b1_v06_[^"]+\.tar\.gz)"', html):
        # HURSAT_b1_v06_{sid}_{NAME}_c{cdate}.tar.gz
        parts = fname.split("_")
        if len(parts) >= 4:
            sid = parts[3]
            mapping[sid] = url + fname
    with _year_cache_lock:
        _year_cache[year] = mapping
    return mapping


def download_tarball(url, dest_path):
    _curl(url, out_path=dest_path, timeout=300)


def render_ir(path):
    """Return JPEG bytes for the IRWIN grid, north-up, or None if unreadable."""
    with _nc_lock:  # HDF5 is not thread-safe
        ds = nc.Dataset(path)
        try:
            if "IRWIN" not in ds.variables:
                return None
            arr = np.squeeze(ds.variables["IRWIN"][:]).astype(np.float32)
            if arr.ndim != 2:
                return None
            lat = np.array(ds.variables["lat"][:])
        finally:
            ds.close()
    filled = np.ma.filled(np.ma.masked_invalid(arr), IR_VMAX)
    idx = np.clip((filled - IR_VMIN) / (IR_VMAX - IR_VMIN), 0, 1)
    rgb = _LUT[(idx * 255).astype(np.uint8)]
    if float(lat[0]) < float(lat[-1]):  # lat ascending -> row 0 is south, flip so north is up
        rgb = rgb[::-1]
    img = Image.fromarray(rgb, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()


def select_frames(members):
    """From tar members, pick one .nc per synoptic time with the lowest VZA."""
    best = {}  # stamp -> (vza, member)
    for m in members:
        base = os.path.basename(m.name)
        mo = _NC_RE.match(base)
        if not mo:
            continue
        stamp = f"{mo['y']}{mo['mo']}{mo['d']}{mo['hm']}"
        vza = int(mo["vza"])
        if stamp not in best or vza < best[stamp][0]:
            best[stamp] = (vza, m)
    return {stamp: m for stamp, (vza, m) in best.items()}


def make_s3_client():
    import boto3

    return boto3.session.Session(profile_name=S3_PROFILE).client("s3")


def process_storm(storm, s3, manifest, dry_run):
    sid = storm["id"]
    # Archive dir is keyed by the SID-prefix (genesis) year, not IBTrACS season.
    year = int(sid[:4])
    try:
        index = fetch_year_index(year)
    except Exception as exc:  # noqa: BLE001
        log(f"[{sid}] year index {year} failed: {exc}")
        return sid, 0, "index-error"
    url = index.get(sid)
    if not url:
        log(f"[{sid}] no HURSAT tarball in {year} archive; skipping")
        save_manifest_entry(manifest, sid, 0)
        return sid, 0, "no-tarball"

    with tempfile.TemporaryDirectory(prefix=f"hursat_{sid}_") as tmp:
        tar_path = os.path.join(tmp, "storm.tar.gz")
        try:
            download_tarball(url, tar_path)
        except Exception as exc:  # noqa: BLE001
            log(f"[{sid}] download failed: {exc}")
            return sid, 0, "download-error"

        try:
            with tarfile.open(tar_path, "r:gz") as tf:
                members = [m for m in tf.getmembers() if m.isfile() and m.name.endswith(".nc")]
                frames = select_frames(members)
                uploaded = 0
                for stamp, member in sorted(frames.items()):
                    tf.extract(member, tmp)
                    nc_path = os.path.join(tmp, member.name)
                    try:
                        jpeg = render_ir(nc_path)
                    except Exception as exc:  # noqa: BLE001
                        log(f"[{sid}] render {stamp} failed: {exc}")
                        jpeg = None
                    finally:
                        try:
                            os.remove(nc_path)
                        except OSError:
                            pass
                    if not jpeg:
                        continue
                    key = f"{S3_PREFIX}/{sid}/{stamp}.jpg"
                    if not dry_run:
                        s3.put_object(
                            Bucket=S3_BUCKET,
                            Key=key,
                            Body=jpeg,
                            ContentType="image/jpeg",
                            CacheControl="public, max-age=31536000, immutable",
                        )
                    uploaded += 1
        except Exception as exc:  # noqa: BLE001
            log(f"[{sid}] processing failed: {exc}")
            return sid, 0, "process-error"

    save_manifest_entry(manifest, sid, uploaded)
    log(f"[{sid}] {storm.get('name','')} {year}: {uploaded} frames{' (dry-run)' if dry_run else ''}")
    return sid, uploaded, "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sids", help="comma-separated SIDs to process (test subset)")
    ap.add_argument("--limit", type=int, help="process at most N storms")
    ap.add_argument("--min-year", type=int, default=MIN_YEAR)
    ap.add_argument("--max-year", type=int, default=MAX_YEAR)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--dry-run", action="store_true", help="render but do not upload")
    ap.add_argument("--force", action="store_true", help="ignore manifest, reprocess")
    args = ap.parse_args()

    storms = load_storms()
    manifest = {} if args.force else load_manifest()

    only = set(s.strip() for s in args.sids.split(",")) if args.sids else None
    todo = []
    for storm in storms.values():
        sid = storm["id"]
        if only is not None:
            if sid not in only:
                continue
        else:
            if not (args.min_year <= storm.get("season", 0) <= args.max_year):
                continue
            if not qualifies(storm):
                continue
        if sid in manifest and not args.force:
            continue
        todo.append(storm)

    todo.sort(key=lambda s: (s.get("season", 0), s["id"]))
    if args.limit:
        todo = todo[: args.limit]

    log(f"{len(todo)} storms to process (workers={args.workers}, dry_run={args.dry_run})")
    if not todo:
        return

    s3 = None if args.dry_run else make_s3_client()

    total_frames = 0
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_storm, s, s3, manifest, args.dry_run): s for s in todo}
        for fut in as_completed(futures):
            sid, frames, status = fut.result()
            total_frames += frames
            done += 1
            if done % 25 == 0:
                log(f"progress: {done}/{len(todo)} storms, {total_frames} frames uploaded")

    log(f"DONE: {done} storms, {total_frames} frames uploaded")


if __name__ == "__main__":
    main()
