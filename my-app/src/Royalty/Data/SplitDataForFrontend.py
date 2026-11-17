"""Split the combined royalty dataset into per-monarchy files for the frontend.

The React app used to statically import the full multi-megabyte
``monarchy_data.json`` (every person across every monarchy) into the JS bundle,
even though a user only views one monarchy at a time. This script bakes down,
for each monarchy, just the node subset that the chart needs and writes it as a
gzipped JSON file under ``public/royalty/`` which the app fetches on demand.

This mirrors the Hurricane component, which serves its large dataset gzipped
from ``public/`` and gunzips it at runtime.

Inputs  (data/):   monarchy_data.json, monarchy_family_trees.json, monarch_list.json,
                   houses.json (optional)
Outputs (public/royalty/):
    index.json                -> sorted list of available monarchy names
    <Monarchy>.json.gz        -> { successionList, monarchList, nodes }
    houses.json               -> [{ id, name }] of available houses (optional)
    <House>.json.gz           -> { type:"house", monarchList, successionList:[],
                                   members, nodes } (optional)

Run via ``python -m royaltree split`` (or standalone from Data/). Pure local transform; no
network access required.
"""
import gzip
import io
import json
import os

from royaltree.store import atomic_write

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PUBLIC_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "royalty")
)


def _flatten(list_of_lists):
    return [item for sub in list_of_lists for item in sub]


def _important_nodes(succession_list, data):
    """Node subset the chart needs for one monarchy.

    Replicates ``extractImportantNodes`` in RoyalTreeUtils.js: every node in the
    succession list plus the father/mother of each such node that exists in the
    dataset.
    """
    flat = _flatten(succession_list)
    important = set(flat)
    for node_id in flat:
        person = data.get(node_id)
        if not person:
            continue
        if "father" in person:
            important.add(person["father"])
        if "mother" in person:
            important.add(person["mother"])
    # Sorted so the payload bytes don't depend on set (hash-seed) order.
    return {node_id: data[node_id] for node_id in sorted(important) if node_id in data}


def _write_gz(path, payload):
    """Write ``payload`` as compact gzipped JSON, byte-deterministically.

    ``mtime=0`` keeps the gzip header stable, so an unchanged payload gives
    identical bytes (and ``aws s3 sync`` skips it). Returns the raw size.
    """
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    buf = io.BytesIO()
    # filename= keeps the same gzip FNAME header as writing to ``path`` directly.
    with gzip.GzipFile(filename=os.path.basename(path), mode="wb", fileobj=buf, mtime=0) as out:
        out.write(raw)
    atomic_write(path, buf.getvalue())
    return len(raw)


def split():
    with open(os.path.join(DATA_DIR, "monarchy_data.json")) as f:
        data = json.load(f)
    with open(os.path.join(DATA_DIR, "monarchy_family_trees.json")) as f:
        family_trees = json.load(f)
    with open(os.path.join(DATA_DIR, "monarch_list.json")) as f:
        monarch_lists = json.load(f)

    # Optional, additive: ancestor+sibling closures for European monarchies
    # (produced by royaltree/build.py combine, stored per-monarchy in
    # monarchy_ancestors.json). Absent -> frontend keeps current behavior.
    extended_map = {}
    extended_path = os.path.join(DATA_DIR, "monarchy_ancestors.json")
    if os.path.exists(extended_path):
        with open(extended_path) as f:
            extended_map = json.load(f)

    os.makedirs(PUBLIC_DIR, exist_ok=True)

    monarchies = sorted(family_trees.keys())
    for monarchy in monarchies:
        succession_list = family_trees.get(monarchy, [])
        payload = {
            "successionList": succession_list,
            "monarchList": monarch_lists.get(monarchy, []),
            "nodes": _important_nodes(succession_list, data),
        }
        extended_ids = extended_map.get(monarchy)
        if extended_ids:
            payload["extendedNodes"] = {
                qid: data[qid] for qid in extended_ids if qid in data
            }
        out_path = os.path.join(PUBLIC_DIR, monarchy + ".json.gz")
        raw_size = _write_gz(out_path, payload)
        extra = ""
        if "extendedNodes" in payload:
            extra = f", {len(payload['extendedNodes'])} extended"
        print(f"{monarchy}: {len(payload['nodes'])} nodes{extra} -> {out_path} ({raw_size} B raw)")

    atomic_write(os.path.join(PUBLIC_DIR, "index.json"), json.dumps(monarchies))
    print(f"Wrote index with {len(monarchies)} monarchies to {PUBLIC_DIR}")
    return monarchies


def split_houses():
    """Emit per-house gzipped payloads and a houses.json index (if built).

    House payloads mirror the monarchy shape so they flow through the same
    frontend loader/merge path, tagged with type:"house" and carrying a
    `members` map (qid -> rankTier) plus a `monarchs` list. `nodes` holds the
    members and their ancestor pool so the frontend can connect a rank-filtered
    subset into a compact subtree.
    """
    houses_path = os.path.join(DATA_DIR, "houses.json")
    if not os.path.exists(houses_path):
        print("No houses.json; skipping house split.")
        return []

    with open(houses_path) as f:
        houses = json.load(f)

    os.makedirs(PUBLIC_DIR, exist_ok=True)
    index = []
    for slug, house in houses.items():
        payload = {
            "type": "house",
            "monarchList": house.get("monarchs", []),
            "successionList": [],
            "members": house.get("members", {}),
            "nodes": house.get("nodes", {}),
        }
        raw_size = _write_gz(os.path.join(PUBLIC_DIR, slug + ".json.gz"), payload)
        index.append({"id": slug, "name": house.get("name", slug)})
        print(f"{slug}: {len(payload['members'])} members, "
              f"{len(payload['nodes'])} nodes ({raw_size} B raw)")

    index.sort(key=lambda h: h["name"])
    atomic_write(os.path.join(PUBLIC_DIR, "houses.json"), json.dumps(index))
    print(f"Wrote houses index with {len(index)} houses to {PUBLIC_DIR}")
    return [h["id"] for h in index]


def listed_names(path, key=None):
    """Names a royalty index file lists (strings only; anything else is ignored)."""
    if not os.path.exists(path):
        return set()
    with open(path) as f:
        items = json.load(f)
    if not isinstance(items, list):
        return set()
    if key:
        items = [i.get(key) for i in items if isinstance(i, dict)]
    return {i for i in items if isinstance(i, str) and i and os.path.basename(i) == i}


def published_names():
    """Payload names the current index.json and houses.json list. Read this
    before split() overwrites them, then hand it to prune()."""
    return (listed_names(os.path.join(PUBLIC_DIR, "index.json"))
            | listed_names(os.path.join(PUBLIC_DIR, "houses.json"), key="id"))


def prune(previous, names):
    """Delete payloads the previous indexes listed that this split no longer
    writes (e.g. a house that fell below MIN_HOUSE_MEMBERS). Only names a
    royalty index listed are ever deleted, so a folder that was never a royalty
    payload folder (a mistyped --out-dir) loses nothing. Returns what was removed."""
    removed = []
    for name in sorted(set(previous) - set(names)):
        path = os.path.join(PUBLIC_DIR, name + ".json.gz")
        if os.path.exists(path):
            os.remove(path)
            removed.append(name + ".json.gz")
            print(f"Removed stale payload {name}.json.gz")
    return removed


if __name__ == "__main__":
    _previous = published_names()
    prune(_previous, split() + split_houses())
