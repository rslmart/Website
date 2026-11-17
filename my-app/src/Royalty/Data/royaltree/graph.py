"""Traversals over the entity store: succession BFS and ancestor closures.

Behaviour is GetData.bfs / construct_family_tree_from_monarch_list and
GatherAncestors._gather_one, but reading from the shared store instead of a
per-monarchy JSON cache that was re-serialised on every call. Missing people
are fetched (online) in 50-ID batches and committed per batch; offline they
count as absent.
"""

from royaltree import http, wdqs, wikidata


# GetData's BFS tuning (see the comment there in git history): depth binds in
# sparse ancient genealogies, the node cap in dense European ones.
MAX_BFS_DEPTH = 8
MAX_BFS_NODES = 4000
SUCCESSOR_WINDOW = 5  # try the next 5 monarchs for a path

MAX_ANCESTOR_DEPTH = 5
DEEP_ANCESTOR_DEPTH = 12

EUROPEAN_MONARCHIES = {
    "Austria", "Bavaria", "Bohemia", "Denmark", "England", "France", "Germany",
    "Greece", "Holy_Roman_Empire", "Hungary", "Iceland", "Naples", "Netherlands",
    "Norway", "Poland", "Portugal", "Russia", "Scotland", "Spain", "Sweden",
}
DEEP_ANCESTOR_MONARCHIES = {
    "Mongol_Empire", "Golden_Horde", "Ilkhanate", "Chagatai_Khanate", "Chinggisids",
}


class Retriever:
    """Person lookups for one tree: store first, then the network (unless offline).

    ``touched`` records every QID the tree asked for, the same set the legacy
    ``data/<M>.json`` cache held for a fresh build; clean/combine uses it to
    decide which relatives belong to the tree, so a tree's membership depends
    only on its own traversal and the shared records, never on build order.
    """

    def __init__(self, store, offline, counters):
        self.store = store
        self.offline = offline
        self.counters = counters
        self.cache = {}
        self.touched = set()
        self.absent = set()  # requested but unavailable offline
        # Undirected father/mother/child links, and the parent end of each one.
        # Built as each level is fetched. A tie is not entered as a link.
        self.adj = {}
        self.parents = {}
        self.linked = set()

    def get_people(self, ids):
        ids = list(dict.fromkeys(ids))
        self.touched.update(ids)
        need = [q for q in ids if q not in self.cache and q not in self.absent]
        if need:
            self._load(need)
            missing = [q for q in need if q not in self.cache]
            if missing:
                if self.offline:
                    self.absent.update(missing)
                else:
                    self._fetch_typed(missing)
        return {q: self.cache.get(q, {}) for q in ids}

    def get_person(self, qid):
        return self.get_people([qid])[qid]

    def present(self, qid):
        return qid in self.cache

    def _load(self, qids):
        typed = self.store.get(wdqs.KIND, qids)
        legacy = self.store.get("person", qids)
        for qid in qids:
            if qid in typed:
                self.cache[qid] = wdqs.merge_person(typed[qid], legacy.get(qid))
            elif qid in legacy:
                self.cache[qid] = legacy[qid]

    def _fetch_typed(self, qids):
        """Store kind ``wdqs``. Kind ``person`` is left as it was."""
        records = wdqs.fetch_typed(qids)
        wdqs.store_typed(self.store, records)
        legacy = self.store.get("person", list(records))
        for qid, rec in records.items():
            self.cache[qid] = wdqs.merge_person(rec, legacy.get(qid))
        self.counters["people_fetched"] += len(records)

    def _fetch(self, qids):
        """Legacy person refresh. The tree walk uses :meth:`_fetch_typed`."""
        for found, batch in wikidata.iter_entity_batches(qids):
            records, revs, labels = {}, {}, {}
            for q in batch:
                ent = found.get(q)
                records[q] = wikidata.parse_person(ent) if ent else {}
                revs[q] = ent.get("lastrevid") if ent else 0  # 0: deleted/missing, not "unknown"
                if ent:
                    labels[q] = records[q].get("label")
            self.store.put_many("person", records, "wbgetentities", revs)
            self.store.put_many("label", labels, "wbgetentities", revs)
            self.cache.update(records)
            self.counters["people_fetched"] += len(records)

    def expand(self, ids):
        """Load ``ids`` and index father/mother/child links, including inverse ones.

        Forward links come from the loaded records. A single best-rank QID is a
        link. A tie is not. Once both people are loaded, a parent who lists the
        child is linked even when the child is silent, and a child who lists a
        parent is linked even when the parent is silent. ``fetch_inverse`` can
        discover a person who is on nobody's fetched statement, but that lookup
        took 14.8s for 40 QIDs on 2026-11-17, so the walk does not call it.
        """
        ids = [qid for qid in dict.fromkeys(ids) if qid]
        if not ids:
            return
        self.get_people(ids)
        pending = [qid for qid in ids if qid not in self.linked]
        for qid in pending:
            self._add_forward(qid)
            self.linked.add(qid)

    def _add_forward(self, qid):
        person = self.cache.get(qid) or {}
        for field in ("father", "mother"):
            parent = person.get(field)
            if isinstance(parent, str):
                self._connect(parent, qid)
        for child in person.get("child") or []:
            if isinstance(child, str):
                self._connect(qid, child)

    def _connect(self, parent, child):
        if not parent or not child or parent == child:
            return
        self.adj.setdefault(parent, [])
        self.adj.setdefault(child, [])
        if child not in self.adj[parent]:
            self.adj[parent].append(child)
        if parent not in self.adj[child]:
            self.adj[child].append(parent)
        self.parents.setdefault(child, [])
        if parent not in self.parents[child]:
            self.parents[child].append(parent)

    def attach_missing_labels(self):
        """English labels for typed rows that do not have one yet.

        WDQS first. ``fetch_labels`` falls back to ``wbgetentities`` when WDQS
        does not answer. Offline runs leave the rows as they are.
        """
        if self.offline:
            return
        qids = [qid for qid in self.touched if qid in self.cache]
        typed = self.store.get(wdqs.KIND, qids)
        need = [qid for qid, rec in typed.items() if not rec.get("label")]
        if not need:
            return
        labels = wdqs.fetch_labels(need)
        subset = {qid: typed[qid] for qid in need}
        wdqs.attach_labels(subset, labels)
        wdqs.store_typed(self.store, subset)
        rows = {qid: (labels.get(qid) or {}).get("label") for qid in need}
        rows = {qid: label for qid, label in rows.items() if label}
        if rows:
            self.store.put_many("label", rows, wdqs.SOURCE)
            self.counters["labels_fetched"] += len(rows)


def bfs(start_id, target_id, retriever, max_depth=MAX_BFS_DEPTH, max_nodes=MAX_BFS_NODES):
    """Shortest path on the fetched father/mother/child graph.

    The search itself only reads ``retriever.adj``. Missing people and inverse
    edges are fetched one level at a time before that level is walked.
    """
    if start_id == target_id:
        return [start_id]
    retriever.expand([start_id])
    visited = {start_id}
    frontier = [(start_id, [start_id])]
    depth = 0
    while frontier and depth < max_depth:
        if len(visited) > max_nodes:
            return None
        next_frontier, to_expand = [], []
        for node_id, path in frontier:
            for neighbor_id in retriever.adj.get(node_id, ()):
                if neighbor_id == target_id:
                    return path + [neighbor_id]
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    next_frontier.append((neighbor_id, path + [neighbor_id]))
                    to_expand.append(neighbor_id)
        retriever.expand(to_expand)
        frontier = next_frontier
        depth += 1
    return None


def family_tree(monarch_ids, retriever):
    """For each monarch, the shortest path to the earliest of the next five."""
    retriever.expand(monarch_ids)
    result = []
    for i, current in enumerate(monarch_ids):
        found = []
        for target in monarch_ids[i + 1:i + 1 + SUCCESSOR_WINDOW]:
            path = bfs(current, target, retriever)
            if path:
                found = path
                break
        result.append(found)
    return result


def gather_ancestors(monarch_ids, retriever, depth, include_siblings):
    """Upward closure over father/mother (+ one lateral sibling level).

    A parent who lists the child is included even when the child does not list
    the parent. The child's own father or mother tie is not a parent link.
    """
    retriever.expand(monarch_ids)
    ancestors = set(monarch_ids)
    frontier = list(monarch_ids)
    for _ in range(depth):
        next_frontier = []
        for node_id in frontier:
            for parent_id in retriever.parents.get(node_id, ()):
                if parent_id not in ancestors:
                    ancestors.add(parent_id)
                    next_frontier.append(parent_id)
        retriever.expand(next_frontier)
        frontier = next_frontier
        if not frontier:
            break
    siblings = set()
    if include_siblings:
        to_fetch = []
        for node_id in sorted(ancestors):
            person = retriever.get_person(node_id)
            if not person:
                continue
            for sibling_id in person.get("sibling", []):
                if isinstance(sibling_id, str) and sibling_id not in ancestors and sibling_id not in siblings:
                    siblings.add(sibling_id)
                    to_fetch.append(sibling_id)
        retriever.expand(to_fetch)
    return sorted(ancestors | siblings)


def ancestor_settings(monarchy):
    """(depth, include_siblings) for trees with an ancestor stage, else None."""
    if monarchy in EUROPEAN_MONARCHIES:
        return MAX_ANCESTOR_DEPTH, True
    if monarchy in DEEP_ANCESTOR_MONARCHIES:
        return DEEP_ANCESTOR_DEPTH, False
    return None


def traverse_tree(monarchy, monarch_ids, store, offline, counters, fresh_membership=False):
    """Run one tree's traversals and persist its artefacts in one transaction.

    ``touched`` is sticky by default: this run's requests are added to the
    tree's earlier ones, as the legacy per-tree cache accumulated them. Relatives
    that only an earlier run fetched (e.g. a monarch's parents when the BFS
    returned before expanding them) therefore stay in the tree. It never depends
    on other trees. ``fresh_membership`` recomputes it from this run alone.
    """
    retriever = Retriever(store, offline, counters)
    tree = family_tree(monarch_ids, retriever)
    artefacts = {"family_tree": tree}
    settings = ancestor_settings(monarchy)
    if settings:
        artefacts["ancestors"] = gather_ancestors(monarch_ids, retriever, *settings)
    retriever.attach_missing_labels()
    touched = {q for q in retriever.touched if retriever.present(q)}
    if not fresh_membership:
        prior = set(store.tree_get(monarchy, "touched", []))
        known = set(store.info("person", prior)) | set(store.info(wdqs.KIND, prior))
        touched |= prior & known
    artefacts["touched"] = sorted(touched)
    store.tree_put(monarchy, artefacts)
    counters["absent_offline"] += len(retriever.absent)
    return artefacts
