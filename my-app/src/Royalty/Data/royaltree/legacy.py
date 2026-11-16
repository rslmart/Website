"""Offline import of the pre-store JSON caches into the entity store.

Reads (never writes) a legacy data directory:
  <M>.json             per-tree person caches (unlabelled records)
  <M>_ancestors.json   per-tree ancestor closures
  properties.json      QID -> label
  monarchy_family_trees.json, monarchy_data.json (committed combined files)

A QID cached by several trees can hold different snapshots. The import keeps
one: the snapshot whose labelled form equals the committed monarchy_data.json
record (that is what is published today), else the one from the most recently
written cache file. Imported rows have no known revision (lastrevid NULL) and an
unknown fetch time, so a later revision check refetches them (capped).
Makes no network requests.
"""
import json
import logging
import os
from collections import Counter

from royaltree import wikidata
from royaltree.store import LEGACY_TIME

log = logging.getLogger("royaltree")

COMBINED = {"monarch_list.json", "monarchy_data.json", "monarchy_family_trees.json",
            "monarchy_ancestors.json", "properties.json", "houses.json"}


def _load(path):
    with open(path) as f:
        return json.load(f)


def _canon(obj):
    return json.dumps(obj, sort_keys=True)


def import_legacy(store, legacy_dir, counters):
    family_trees = _load(os.path.join(legacy_dir, "monarchy_family_trees.json"))
    published = _load(os.path.join(legacy_dir, "monarchy_data.json"))
    properties = _load(os.path.join(legacy_dir, "properties.json"))

    names = sorted(f[:-5] for f in os.listdir(legacy_dir)
                   if f.endswith(".json") and f not in COMBINED
                   and not f.endswith(("_labelled.json", "_ancestors.json", "_family_tree.json")))
    candidates = {}  # qid -> {canon: (mtime, record, tree)}
    touched = {}
    for m in names:
        path = os.path.join(legacy_dir, m + ".json")
        mtime = os.stat(path).st_mtime
        cache = _load(path)
        touched[m] = sorted(cache)
        for q, rec in cache.items():
            slot = candidates.setdefault(q, {})
            key = _canon(rec)
            if key not in slot or slot[key][0] < mtime:
                slot[key] = (mtime, rec, m)
        counters["legacy_cache_files"] += 1
        counters["legacy_cache_records"] += len(cache)

    stats = Counter()
    chosen = {}
    sources = {}
    for q, slot in candidates.items():
        options = list(slot.values())
        if len(options) == 1:
            pick = options[0]
            stats["single_snapshot"] += 1
        else:
            target = published.get(q)
            matches = [o for o in options
                       if target is not None and wikidata.label_record(o[1], properties) == target]
            if len(matches) >= 1:
                pick = max(matches, key=lambda o: o[0])
                stats["conflict_resolved_by_published"] += 1
            else:
                pick = max(options, key=lambda o: o[0])
                stats["conflict_resolved_by_newest_cache"] += 1
        chosen[q] = pick[1]
        sources[q] = pick[2]

    by_source = {}
    for q, m in sources.items():
        by_source.setdefault(m, {})[q] = chosen[q]
    for m, recs in sorted(by_source.items()):
        store.put_many("person", recs, f"legacy:{m}.json", fetched_at=LEGACY_TIME)

    labels = dict(properties)
    overlaid = 0
    for q, rec in chosen.items():
        if rec and labels.get(q) != rec.get("label"):
            labels[q] = rec.get("label")
            overlaid += 1
    store.put_many("label", labels, "legacy:properties.json", fetched_at=LEGACY_TIME)

    trees = 0
    for m, tree in family_trees.items():
        artefacts = {"family_tree": tree, "touched": touched.get(m, [])}
        anc_path = os.path.join(legacy_dir, m + "_ancestors.json")
        if os.path.exists(anc_path):
            artefacts["ancestors"] = _load(anc_path)
        store.tree_put(m, artefacts)
        trees += 1

    counters.update({f"import_{k}": v for k, v in stats.items()})
    counters["import_people"] = len(chosen)
    counters["import_labels"] = len(labels)
    counters["import_labels_overlaid_from_people"] = overlaid
    counters["import_trees"] = trees
    counters["import_published_not_in_any_cache"] = len(set(published) - set(chosen))
    return stats
