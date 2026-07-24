#!/usr/bin/env python3
"""Build the Photos page dataset from a folder of originals.

This is an offline asset pipeline (mirrors src/Hurricane/data/convertIbtracsToJson.py
and src/Royalty/.../buildMonarchImages.py). It reads the original photos, extracts
EXIF GPS + capture date + camera, generates three web-optimized sizes per photo, and
writes a photos.json manifest. The originals never enter the JS bundle; the page fetches
the manifest and images at runtime from S3 (served via CloudFront at makoa.link/photos).

Layout
------
  src/Photos/Data/            <- input originals (jpg/jpeg/png/heic), git-ignored
  src/Photos/overrides.json   <- hand-editable {id: {lat, lng, date}} for photos whose
                                 EXIF lacks GPS/date. Auto-stubbed on first run.
  src/Photos/output/          <- generated (git-ignored):
      photos.json
      thumb/<id>.jpg          (~160px  markers + timeline)
      gallery/<id>.jpg        (~800px  grid + map popovers)
      large/<id>.jpg          (~2000px lightbox)

Usage
-----
  pip install pillow pillow-heif
  python3 src/Photos/build_photos.py                 # uses ./Data next to this script
  python3 src/Photos/build_photos.py --input /path/to/photos --output /tmp/out

Deploy (mirrors deploy.sh's data-upload pattern; note the deliberate lack of --delete
at the bucket root, and that these assets are managed OUTSIDE the site build):
  aws s3 sync src/Photos/output "s3://$S3_BUCKET/photos" \
      --cache-control "public, max-age=86400"
  aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --paths "/photos/*"

The manifest then lives at https://makoa.link/photos/photos.json and images at
https://makoa.link/photos/thumb/<id>.jpg (etc.), which is what PhotosPage.jsx fetches.
"""

import argparse
import json
import os
import sys
from datetime import datetime

try:
    from PIL import Image, ImageOps, ExifTags
except ImportError:
    sys.exit("Pillow is required. Install it with: pip install pillow pillow-heif")

# HEIC support (iPhone photos). Optional so plain jpg/png collections still work.
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIC_OK = True
except ImportError:
    HEIC_OK = False

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}

# (subdir, max_edge_px, jpeg_quality). Aspect ratio preserved; longest edge capped.
SIZES = (
    ("thumb", 160, 72),
    ("gallery", 800, 82),
    ("large", 2000, 85),
)

# EXIF tag numbers we care about (avoids depending on name lookups).
TAG_DATETIME_ORIGINAL = 0x9003
TAG_MAKE = 0x010F
TAG_MODEL = 0x0110
GPS_IFD = 0x8825


def _rational_to_float(value):
    """PIL returns GPS coords as IFDRational or (num, den) tuples."""
    try:
        return float(value)
    except (TypeError, ValueError):
        try:
            return value[0] / value[1]
        except (TypeError, ZeroDivisionError, IndexError):
            return None


def _dms_to_degrees(dms, ref):
    if not dms or len(dms) < 3:
        return None
    parts = [_rational_to_float(v) for v in dms[:3]]
    if any(p is None for p in parts):
        return None
    deg = parts[0] + parts[1] / 60.0 + parts[2] / 3600.0
    if ref in ("S", "W"):
        deg = -deg
    return round(deg, 6)


def _parse_exif_date(raw):
    """EXIF stores dates as 'YYYY:MM:DD HH:MM:SS'. Return ISO 8601 or None."""
    if not raw:
        return None
    raw = str(raw).strip().split(".")[0]
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d"):
        try:
            return datetime.strptime(raw, fmt).isoformat()
        except ValueError:
            continue
    return None


def extract_metadata(img):
    """Return {lat, lng, date, camera} from an open image's EXIF (values may be None)."""
    meta = {"lat": None, "lng": None, "date": None, "camera": None}
    try:
        exif = img.getexif()
    except Exception:
        return meta
    if not exif:
        return meta

    # DateTimeOriginal lives in the Exif sub-IFD (0x8769), not the top-level IFD
    # that getexif() returns; fall back to the top-level DateTime (0x0132).
    try:
        exif_ifd = exif.get_ifd(0x8769)
    except Exception:
        exif_ifd = {}
    date_raw = (exif_ifd or {}).get(TAG_DATETIME_ORIGINAL) or exif.get(0x0132)
    meta["date"] = _parse_exif_date(date_raw)

    make = (exif.get(TAG_MAKE) or "").strip()
    model = (exif.get(TAG_MODEL) or "").strip()
    if model and make and not model.startswith(make):
        meta["camera"] = f"{make} {model}"
    else:
        meta["camera"] = model or make or None

    try:
        gps = exif.get_ifd(GPS_IFD)
    except Exception:
        gps = None
    if gps:
        lat = _dms_to_degrees(gps.get(2), gps.get(1))
        lng = _dms_to_degrees(gps.get(4), gps.get(3))
        if lat is not None and lng is not None:
            meta["lat"], meta["lng"] = lat, lng
    return meta


def render_sizes(img, photo_id, output_dir):
    """Write the three sized JPEGs. Returns (rel_paths dict, (width, height) of large)."""
    base = ImageOps.exif_transpose(img).convert("RGB")
    rel = {}
    large_dims = base.size
    for subdir, max_edge, quality in SIZES:
        out_sub = os.path.join(output_dir, subdir)
        os.makedirs(out_sub, exist_ok=True)
        resized = base.copy()
        resized.thumbnail((max_edge, max_edge), Image.LANCZOS)
        if subdir == "large":
            large_dims = resized.size
        out_path = os.path.join(out_sub, f"{photo_id}.jpg")
        resized.save(out_path, "JPEG", quality=quality, optimize=True, progressive=True)
        rel[subdir] = f"{subdir}/{photo_id}.jpg"
    return rel, large_dims


def load_overrides(path):
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def write_overrides_stub(path, unplaced, undated):
    """Create an overrides.json stub for photos needing manual lat/lng/date."""
    stub = {}
    for pid in sorted(set(unplaced) | set(undated)):
        entry = {}
        if pid in unplaced:
            entry["lat"] = None
            entry["lng"] = None
        if pid in undated:
            entry["date"] = None
        stub[pid] = entry
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(stub, fh, indent=2)
        fh.write("\n")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Build the Photos page dataset.")
    parser.add_argument("--input", default=os.path.join(here, "Data"),
                        help="Folder of original photos (default: ./Data next to this script).")
    parser.add_argument("--output", default=os.path.join(here, "output"),
                        help="Where to write photos.json and the sized images.")
    parser.add_argument("--overrides", default=os.path.join(here, "overrides.json"),
                        help="Hand-editable {id: {lat,lng,date}} for photos missing EXIF.")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip re-rendering photos whose output sizes already exist "
                             "(still reads EXIF for the manifest). Speeds up reruns.")
    parser.add_argument("--prune", action="store_true",
                        help="Delete generated images in the output sizes whose source is "
                             "no longer in the input folder (removed photos). Use after "
                             "deleting originals from Data/.")
    args = parser.parse_args()

    if not os.path.isdir(args.input):
        sys.exit(f"Input folder not found: {args.input}")
    if not HEIC_OK:
        print("WARNING: pillow-heif not installed; .heic/.heif files will be skipped.\n"
              "         Install it with: pip install pillow-heif", file=sys.stderr)

    overrides = load_overrides(args.overrides)
    os.makedirs(args.output, exist_ok=True)

    files = sorted(
        f for f in os.listdir(args.input)
        if os.path.splitext(f)[1].lower() in IMAGE_EXTS
    )

    photos = []
    unplaced, undated, skipped = [], [], []
    used_ids = set()

    for idx, name in enumerate(files, 1):
        ext = os.path.splitext(name)[1].lower()
        if ext in (".heic", ".heif") and not HEIC_OK:
            skipped.append(name)
            continue
        # Disambiguate stems shared across extensions (e.g. IMG_1377.HEIC + .JPG)
        # so their outputs and manifest ids never collide.
        stem = os.path.splitext(name)[0]
        photo_id = stem
        dup = 2
        while photo_id in used_ids:
            photo_id = f"{stem}-{ext.lstrip('.')}" if dup == 2 else f"{stem}-{ext.lstrip('.')}-{dup}"
            dup += 1
        used_ids.add(photo_id)

        src_path = os.path.join(args.input, name)
        rel = {sub: f"{sub}/{photo_id}.jpg" for sub, _, _ in SIZES}
        have_all = all(os.path.isfile(os.path.join(args.output, r)) for r in rel.values())
        print(f"[{idx}/{len(files)}] {name}")
        try:
            with Image.open(src_path) as img:
                meta = extract_metadata(img)
                if args.skip_existing and have_all:
                    with Image.open(os.path.join(args.output, rel["large"])) as big:
                        w, h = big.size
                else:
                    rel, (w, h) = render_sizes(img, photo_id, args.output)
        except Exception as exc:  # noqa: BLE001 - report and continue the batch
            print(f"    ! failed: {exc}", file=sys.stderr)
            skipped.append(name)
            continue

        ov = overrides.get(photo_id, {})
        lat = ov.get("lat") if ov.get("lat") is not None else meta["lat"]
        lng = ov.get("lng") if ov.get("lng") is not None else meta["lng"]
        date = ov.get("date") or meta["date"]

        if lat is None or lng is None:
            unplaced.append(photo_id)
        if date is None:
            undated.append(photo_id)

        photos.append({
            "id": photo_id,
            "lat": lat,
            "lng": lng,
            "date": date,
            "width": w,
            "height": h,
            "camera": meta["camera"],
            "caption": ov.get("caption", ""),
            "thumb": rel["thumb"],
            "gallery": rel["gallery"],
            "large": rel["large"],
        })

    # Sort chronologically (undated sink to the end) for a stable timeline order.
    photos.sort(key=lambda p: (p["date"] is None, p["date"] or ""))

    manifest = {
        "generated": datetime.utcnow().isoformat() + "Z",
        "count": len(photos),
        "placed": len(photos) - len(unplaced),
        "unplaced": sorted(unplaced),
        "photos": photos,
    }
    manifest_path = os.path.join(args.output, "photos.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(",", ":"))

    # Drop generated images whose original was removed from the input folder.
    pruned = 0
    if args.prune:
        for subdir, _, _ in SIZES:
            sub_path = os.path.join(args.output, subdir)
            if not os.path.isdir(sub_path):
                continue
            for fname in os.listdir(sub_path):
                stem, ext = os.path.splitext(fname)
                if ext.lower() == ".jpg" and stem not in used_ids:
                    os.remove(os.path.join(sub_path, fname))
                    pruned += 1

    # Stub overrides.json so it's easy to hand-place the stragglers.
    if not os.path.isfile(args.overrides) and (unplaced or undated):
        write_overrides_stub(args.overrides, unplaced, undated)
        print(f"\nWrote overrides stub: {args.overrides}")

    print("\n--- summary ---")
    print(f"  processed:  {len(photos)}")
    print(f"  placed:     {len(photos) - len(unplaced)}")
    print(f"  unplaced:   {len(unplaced)}  {sorted(unplaced) if unplaced else ''}")
    print(f"  undated:    {len(undated)}  {sorted(undated) if undated else ''}")
    if skipped:
        print(f"  skipped:    {len(skipped)}  {skipped}")
    if args.prune:
        print(f"  pruned:     {pruned} orphaned image file(s)")
    print(f"  manifest:   {manifest_path}")
    print("\nNext: aws s3 sync output to s3://$S3_BUCKET/photos (see this file's docstring).")


if __name__ == "__main__":
    main()
