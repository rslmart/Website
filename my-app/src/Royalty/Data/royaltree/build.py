"""Derive the combined data files from the store (clean/combine + ancestors).

Replaces CleanRoyalTreeData.clean_and_combine and GatherAncestors.combine_ancestors.
The combined files are a pure function of the store: every tree contributes its
people (succession nodes, their parents/spouses/siblings, and its ancestor
closure, each limited to what that tree's own traversal requested) and each
person's record comes from the one store row for that QID. So rebuilding one
tree cannot change another tree's people, whatever the build order.
"""
import json
import logging
import os

from royaltree import wikidata
from royaltree.store import atomic_write

log = logging.getLogger("royaltree")

RELATIVE_FIELDS = ("father", "mother")
RELATIVE_LIST_FIELDS = ("spouse", "sibling", "unmarried partner")


class Labels:
    """QID -> English label from the store, fetching missing ones when online."""

    def __init__(self, store, offline, counters):
        self.store = store
        self.offline = offline
        self.counters = counters
        self.map = {}

    def ensure(self, qids):
        need = [q for q in sorted(qids) if q not in self.map]
        if not need:
            return
        found = self.store.get("label", need)
        self.map.update(found)
        missing = [q for q in need if q not in found]
        if missing and not self.offline:
            for ents, batch in wikidata.iter_entity_batches(missing, props="labels|info"):
                labels = {q: wikidata.entity_label(ents.get(q)) for q in batch}
                revs = {q: ents[q].get("lastrevid") for q in batch if q in ents}
                self.store.put_many("label", labels, "wbgetentities", revs)
                self.map.update(labels)
                self.counters["labels_fetched"] += len(labels)
        elif missing:
            self.counters["labels_missing_offline"] += len(missing)

    def get(self, qid, default=None):
        return self.map.get(qid, default)


def _labelled(store, labels, qids):
    raw = store.get("person", qids)
    needed = set()
    for rec in raw.values():
        needed |= wikidata.qids_in(rec)
    labels.ensure(needed)
    return {q: wikidata.label_record(rec, labels) for q, rec in raw.items()}


def combine(store, offline, counters):
    """Return (monarchy_data, family_trees, ancestors_map) for every stored tree."""
    family_trees = store.trees("family_tree")
    ancestors = store.trees("ancestors")
    touched = {m: set(v) for m, v in store.trees("touched").items()}
    labels = Labels(store, offline, counters)

    succession = {m: {q for path in tree for q in path} & touched.get(m, set())
                  for m, tree in family_trees.items()}
    people = _labelled(store, labels, set().union(*succession.values()) if succession else set())

    wanted = {}
    for m in family_trees:
        t = touched.get(m, set())
        important = set()
        for q in succession[m]:
            person = people.get(q)
            if person is None:
                continue
            important.add(q)
            for field in RELATIVE_FIELDS:
                important.add(person.get(field, q))
            for field in RELATIVE_LIST_FIELDS:
                important.update(person.get(field, []))
        wanted[m] = (important & t, [q for q in ancestors.get(m, []) if q in t])
    extra = set()
    for imp, anc in wanted.values():
        extra |= imp | set(anc)
    people.update(_labelled(store, labels, extra - people.keys()))

    data, ancestors_map = {}, {}
    for m in sorted(family_trees):
        imp, anc = wanted[m]
        for q in imp:
            if q in people:
                data[q] = people[q]
        if m in ancestors:
            kept = [q for q in anc if people.get(q, {}).get("label")]
            for q in kept:
                data[q] = people[q]
            ancestors_map[m] = kept
    data = {q: data[q] for q in sorted(data, key=_qid_key)}
    return data, dict(sorted(family_trees.items())), ancestors_map


def _qid_key(q):
    return (len(q), q)


def write_combined(data_dir, data, family_trees, ancestors_map):
    atomic_write(os.path.join(data_dir, "monarchy_data.json"), json.dumps(data))
    atomic_write(os.path.join(data_dir, "monarchy_family_trees.json"),
                 json.dumps(family_trees, indent=4))
    atomic_write(os.path.join(data_dir, "monarchy_ancestors.json"), json.dumps(ancestors_map))
