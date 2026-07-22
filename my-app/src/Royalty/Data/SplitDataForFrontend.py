"""Split the combined royalty dataset into per-monarchy files for the frontend.

The React app used to statically import the full multi-megabyte
``monarchy_data.json`` (every person across every monarchy) into the JS bundle,
even though a user only views one monarchy at a time. This script bakes down,
for each monarchy, just the node subset that the chart needs and writes it as a
gzipped JSON file under ``public/royalty/`` which the app fetches on demand.

This mirrors the Hurricane component, which serves its large dataset gzipped
from ``public/`` and gunzips it at runtime.

Inputs  (data/):   monarchy_data.json, monarchy_family_trees.json, monarch_list.json
Outputs (public/royalty/):
    index.json                -> sorted list of available monarchy names
    <Monarchy>.json.gz        -> { successionList, monarchList, nodes }

Run from the Data/ directory (or via pipeline.py). Pure local transform; no
network access required.
"""
import gzip
import json
import os

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
    return {node_id: data[node_id] for node_id in important if node_id in data}


def split():
    with open(os.path.join(DATA_DIR, "monarchy_data.json")) as f:
        data = json.load(f)
    with open(os.path.join(DATA_DIR, "monarchy_family_trees.json")) as f:
        family_trees = json.load(f)
    with open(os.path.join(DATA_DIR, "monarch_list.json")) as f:
        monarch_lists = json.load(f)

    # Optional, additive: ancestor+sibling closures for European monarchies
    # (produced by GatherAncestors.combine_ancestors, stored per-monarchy in
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
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        out_path = os.path.join(PUBLIC_DIR, monarchy + ".json.gz")
        with gzip.open(out_path, "wb") as out:
            out.write(raw)
        extra = ""
        if "extendedNodes" in payload:
            extra = f", {len(payload['extendedNodes'])} extended"
        print(f"{monarchy}: {len(payload['nodes'])} nodes{extra} -> {out_path} ({len(raw)} B raw)")

    with open(os.path.join(PUBLIC_DIR, "index.json"), "w") as f:
        json.dump(monarchies, f)
    print(f"Wrote index with {len(monarchies)} monarchies to {PUBLIC_DIR}")


if __name__ == "__main__":
    split()
