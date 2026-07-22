"""Fetch monarch portraits from Wikimedia Commons and upload them to S3.

The royal-tree charts show a small portrait on each node. Rather than hotlink
Wikimedia at runtime (discouraged at scale) or commit thousands of images to the
repo, we mirror the Hurricane page's approach: pre-fetch each portrait once and
self-host it in the project's S3 bucket, served via CloudFront.

For each person in data/monarchy_data.json that has an `image` filename we:
  1. fetch a width-limited thumbnail straight from Commons via the official
     Special:FilePath endpoint (no HTML scraping, no md5 hashing),
  2. normalize it to JPEG (RGB) with Pillow, and
  3. upload it to s3://makoa.link/monarchy/<Qid>.jpg
     (publicly served via CloudFront at https://makoa.link/monarchy/...).

The frontend builds the same key on the fly from the person's Wikidata id
(RoyalTreeUtils.monarchImageUrl), so no manifest is needed on the client; nodes
without an uploaded portrait fall back to their solid fill color.

The job is resumable: completed Q-IDs are recorded in monarch_images_manifest.json
and skipped on re-run. Run with the pipeline venv (or uv):

    ./.venv/bin/python buildMonarchImages.py
    uv run --with boto3 --with pillow --with requests python buildMonarchImages.py

Useful flags: --ids Q102005 (test one), --limit N, --workers N, --dry-run,
--force (ignore manifest), --width PX.
"""

import argparse
import io
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "data", "monarchy_data.json")
MANIFEST_PATH = os.path.join(HERE, "monarch_images_manifest.json")

S3_BUCKET = "makoa.link"
S3_PREFIX = "monarchy"
S3_PROFILE = "makoa"

# Portraits render at ~45x70 px on the node; 200 px wide leaves retina headroom
# while keeping objects tiny.
THUMB_WIDTH = 200
JPEG_QUALITY = 82

# Wikimedia requires a descriptive User-Agent (see utils.WIKIMEDIA_HEADERS).
HEADERS = {"User-Agent": "MonarchyBot/0.1 (makoa1693@gmail.com)"}
FILEPATH_BASE = "https://commons.wikimedia.org/wiki/Special:FilePath"

_print_lock = threading.Lock()
_manifest_lock = threading.Lock()


def log(msg):
    with _print_lock:
        print(msg, flush=True)


def load_people():
    with open(DATA_PATH) as fp:
        return json.load(fp)


def load_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH) as fp:
            return json.load(fp)
    return {}


def save_manifest_entry(manifest, qid, filename):
    with _manifest_lock:
        manifest[qid] = {"file": filename, "ts": int(time.time())}
        tmp = MANIFEST_PATH + ".tmp"
        with open(tmp, "w") as fp:
            json.dump(manifest, fp)
        os.replace(tmp, MANIFEST_PATH)


def make_s3_client():
    import boto3

    return boto3.session.Session(profile_name=S3_PROFILE).client("s3")


def fetch_jpeg(filename, width):
    """Fetch a Commons thumbnail and return normalized JPEG bytes, or None."""
    name = filename.replace(" ", "_")
    url = f"{FILEPATH_BASE}/{requests.utils.quote(name)}?width={width}"
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    with Image.open(io.BytesIO(resp.content)) as img:
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue()


def process_person(person, s3, manifest, width, dry_run):
    qid = person["id"]
    filename = person["image"][0]
    try:
        jpeg = fetch_jpeg(filename, width)
    except Exception as exc:  # noqa: BLE001
        log(f"[{qid}] fetch failed ({filename}): {exc}")
        return qid, "fetch-error"

    if not jpeg:
        return qid, "no-image"

    key = f"{S3_PREFIX}/{qid}.jpg"
    if not dry_run:
        try:
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=jpeg,
                ContentType="image/jpeg",
                CacheControl="public, max-age=31536000, immutable",
            )
        except Exception as exc:  # noqa: BLE001
            log(f"[{qid}] upload failed: {exc}")
            return qid, "upload-error"

    save_manifest_entry(manifest, qid, filename)
    return qid, "ok"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ids", nargs="*", help="Only process these Q-IDs.")
    ap.add_argument("--limit", type=int, help="Process at most N people.")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--width", type=int, default=THUMB_WIDTH)
    ap.add_argument("--dry-run", action="store_true", help="fetch but do not upload")
    ap.add_argument("--force", action="store_true", help="ignore manifest, reprocess")
    args = ap.parse_args()

    people = load_people()
    manifest = load_manifest()

    todo = []
    for person in people.values():
        qid = person.get("id")
        if not qid or not person.get("image"):
            continue
        if args.ids and qid not in args.ids:
            continue
        if not args.force and qid in manifest:
            continue
        todo.append(person)

    if args.limit:
        todo = todo[: args.limit]

    total = len(people)
    with_img = sum(1 for p in people.values() if p.get("image"))
    log(f"{total} people, {with_img} with a portrait, {len(todo)} to fetch"
        f"{' (dry-run)' if args.dry_run else ''}")
    if not todo:
        return

    s3 = None if args.dry_run else make_s3_client()

    counts = {}
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_person, p, s3, manifest, args.width, args.dry_run): p
            for p in todo
        }
        for fut in as_completed(futures):
            _, status = fut.result()
            counts[status] = counts.get(status, 0) + 1
            done += 1
            if done % 100 == 0:
                log(f"progress: {done}/{len(todo)}  {counts}")

    log(f"DONE: {done} processed  {counts}")


if __name__ == "__main__":
    main()
