"""Traversals over the entity store: succession BFS and ancestor closures.

Behaviour is GetData.bfs / construct_family_tree_from_monarch_list and
GatherAncestors._gather_one, but reading from the shared store instead of a
per-monarchy JSON cache that was re-serialised on every call. Missing people
are fetched (online) in 50-ID batches and committed per batch; offline they
count as absent.
"""

from royaltree import http, wikidata


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

    def get_people(self, ids):
        ids = list(dict.fromkeys(ids))
        self.touched.update(ids)
        need = [q for q in ids if q not in self.cache and q not in self.absent]
        if need:
            found = self.store.get("person", need)
            self.cache.update(found)
            missing = [q for q in need if q not in found]
            if missing:
                if self.offline:
                    self.absent.update(missing)
                else:
                    self._fetch(missing)
        return {q: self.cache.get(q, {}) for q in ids}

    def get_person(self, qid):
        return self.get_people([qid])[qid]

    def present(self, qid):
        return qid in self.cache

    def _fetch(self, qids):
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


def _neighbors_of(person):
    neighbors = []
    if person.get("father"):
        neighbors.append(person["father"])
    if person.get("mother"):
        neighbors.append(person["mother"])
    neighbors.extend(person.get("child", []))
    return neighbors


def bfs(start_id, target_id, retriever, max_depth=MAX_BFS_DEPTH, max_nodes=MAX_BFS_NODES):
    """Level-synchronised shortest path over father/mother/child edges."""
    if start_id == target_id:
        return [start_id]
    visited = {start_id}
    retriever.get_people([start_id])
    frontier = [(start_id, [start_id])]
    depth = 0
    while frontier and depth < max_depth:
        if len(visited) > max_nodes:
            return None
        next_frontier, to_fetch = [], []
        for node_id, path in frontier:
            person = retriever.get_person(node_id)
            if not person:
                continue
            for neighbor_id in _neighbors_of(person):
                if neighbor_id == target_id:
                    return path + [neighbor_id]
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    next_frontier.append((neighbor_id, path + [neighbor_id]))
                    to_fetch.append(neighbor_id)
        retriever.get_people(to_fetch)
        frontier = next_frontier
        depth += 1
    return None


def family_tree(monarch_ids, retriever):
    """For each monarch, the shortest path to the earliest of the next five."""
    retriever.get_people(monarch_ids)
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
    """Upward closure over father/mother (+ one lateral sibling level)."""
    retriever.get_people(monarch_ids)
    ancestors = set(monarch_ids)
    frontier = list(monarch_ids)
    for _ in range(depth):
        to_fetch, next_frontier = [], []
        for node_id in frontier:
            person = retriever.get_person(node_id)
            if not person:
                continue
            for parent_id in (person.get("father"), person.get("mother")):
                if parent_id and parent_id not in ancestors:
                    ancestors.add(parent_id)
                    next_frontier.append(parent_id)
                    to_fetch.append(parent_id)
        retriever.get_people(to_fetch)
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
                if sibling_id not in ancestors and sibling_id not in siblings:
                    siblings.add(sibling_id)
                    to_fetch.append(sibling_id)
        retriever.get_people(to_fetch)
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
    touched = {q for q in retriever.touched if retriever.present(q)}
    if not fresh_membership:
        prior = set(store.tree_get(monarchy, "touched", []))
        touched |= prior & set(store.info("person", prior))
    artefacts["touched"] = sorted(touched)
    store.tree_put(monarchy, artefacts)
    counters["absent_offline"] += len(retriever.absent)
    return artefacts
