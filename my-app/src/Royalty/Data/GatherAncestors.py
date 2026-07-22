"""Additive pipeline stage: gather common-ancestor data for European monarchies.

This layers on top of the existing pipeline without changing it. The base build
(GetData succession BFS -> label -> clean_and_combine -> split) is untouched;
this stage only *adds* an ancestor-and-sibling closure per European monarchy so
the frontend can reveal where dynasties share ancestors when several are viewed
together.

What we gather: ancestors (following father/mother out to MAX_ANCESTOR_DEPTH from
each monarch) plus the siblings of every one of those ancestors. Ancestors give
the shared-ancestor bridges (cousins meet at a shared grandparent); siblings add
a lateral level so a bridge can still form when the shared parent is missing from
Wikidata, and so the branching at a common ancestor (which child each dynasty
descends through) is visible. Both are bounded (~2**depth ancestors, each with a
handful of siblings), so the data stays compact. Descendants are deliberately
excluded — they explode and are not needed to surface shared ancestry.

Stages:
  gather_ancestors  -> data/<M>_ancestors.json  (ancestor+sibling Q-IDs per
                       monarchy; also warms data/<M>.json with new fetches)
  combine_ancestors -> folds those records into data/monarchy_data.json and
                       writes data/monarchy_ancestors.json (monarchy -> [Q-IDs])

Run gather_ancestors BEFORE label_people so the new people get labelled in the
existing single pass; run combine_ancestors AFTER clean_and_combine so it can add
to the combined pool. SplitDataForFrontend picks up monarchy_ancestors.json and
emits an `extendedNodes` field for these monarchies.
"""
import json
import os

from GetData import DataRetriever

# How many generations up from each monarch to gather. Bounded at ~2**depth
# people per monarch before pedigree collapse.
MAX_ANCESTOR_DEPTH = 5

# Monarchies that meaningfully share ancestry with each other. Non-European
# houses (Chinese/Korean/Japanese dynasties, the khanates, Egypt, etc.) do not,
# so we skip them to keep the data and build cost down. Byzantine/Ottoman are
# left out by default; add them here if you want their European marriages linked.
EUROPEAN_MONARCHIES = {
    "Austria", "Bavaria", "Bohemia", "Denmark", "England", "France", "Germany",
    "Greece", "Holy_Roman_Empire", "Hungary", "Iceland", "Naples", "Netherlands",
    "Norway", "Poland", "Portugal", "Russia", "Scotland", "Spain", "Sweden",
}

DATA_DIR = "./data"


def _european(monarchies):
    return [m for m in monarchies if m in EUROPEAN_MONARCHIES]


def _gather_one(monarchy, depth):
    """Level-synchronous upward BFS over father/mother, plus one sibling level.

    Batch-fetches each generation (mirrors GetData.bfs) to stay friendly to
    Wikidata's rate limits, then fetches the siblings of every gathered ancestor.
    Reuses data/<M>.json so only missing people are fetched.
    """
    retriever = DataRetriever(local_file=os.path.join(DATA_DIR, monarchy + ".json"))
    with open(os.path.join(DATA_DIR, "monarch_list.json")) as f:
        monarch_ids = json.load(f).get(monarchy, [])

    retriever.get_people_from_item_ids(monarch_ids)
    ancestors = set(monarch_ids)
    frontier = list(monarch_ids)

    for _ in range(depth):
        to_fetch = []
        next_frontier = []
        for node_id in frontier:
            person = retriever.get_person_from_item_id(node_id)
            if not person:
                continue
            for parent_id in (person.get("father"), person.get("mother")):
                if parent_id and parent_id not in ancestors:
                    ancestors.add(parent_id)
                    next_frontier.append(parent_id)
                    to_fetch.append(parent_id)
        retriever.get_people_from_item_ids(to_fetch)
        frontier = next_frontier
        if not frontier:
            break

    # One lateral level: the siblings of every gathered ancestor (and monarch).
    siblings = set()
    to_fetch = []
    for node_id in ancestors:
        person = retriever.get_person_from_item_id(node_id)
        if not person:
            continue
        for sibling_id in person.get("sibling", []):
            if sibling_id not in ancestors and sibling_id not in siblings:
                siblings.add(sibling_id)
                to_fetch.append(sibling_id)
    retriever.get_people_from_item_ids(to_fetch)

    extended = ancestors | siblings
    with open(os.path.join(DATA_DIR, monarchy + "_ancestors.json"), "w") as f:
        json.dump(sorted(extended), f)
    return ancestors, siblings


def gather_ancestors(monarchies, depth=MAX_ANCESTOR_DEPTH):
    targets = _european(monarchies)
    for monarchy in targets:
        print(f"Gathering ancestors+siblings (depth {depth}): {monarchy}")
        ancestors, siblings = _gather_one(monarchy, depth)
        print(f"  {monarchy}: {len(ancestors)} ancestors + {len(siblings)} siblings")


def combine_ancestors(monarchies):
    """Fold ancestor records into the combined pool and record the per-monarchy sets.

    Must run after clean_and_combine (which (re)creates monarchy_data.json) and
    after label_people (which produces <M>_labelled.json including the ancestors).
    """
    targets = _european(monarchies)

    with open(os.path.join(DATA_DIR, "monarchy_data.json")) as f:
        data = json.load(f)

    ancestors_map = {}
    ancestors_map_path = os.path.join(DATA_DIR, "monarchy_ancestors.json")
    if os.path.exists(ancestors_map_path):
        with open(ancestors_map_path) as f:
            ancestors_map = json.load(f)

    for monarchy in targets:
        ancestors_path = os.path.join(DATA_DIR, monarchy + "_ancestors.json")
        labelled_path = os.path.join(DATA_DIR, monarchy + "_labelled.json")
        if not (os.path.exists(ancestors_path) and os.path.exists(labelled_path)):
            print(f"  skipping {monarchy}: missing ancestor or labelled data")
            continue
        with open(ancestors_path) as f:
            ancestor_ids = json.load(f)
        with open(labelled_path) as f:
            labelled = json.load(f)

        kept = []
        for qid in ancestor_ids:
            person = labelled.get(qid)
            if person and person.get("label"):
                data[qid] = person
                kept.append(qid)
        ancestors_map[monarchy] = kept
        print(f"  {monarchy}: {len(kept)} labelled ancestors folded in")

    with open(os.path.join(DATA_DIR, "monarchy_data.json"), "w") as f:
        json.dump(data, f)
    with open(ancestors_map_path, "w") as f:
        json.dump(ancestors_map, f)


if __name__ == "__main__":
    import sys
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    args = sys.argv[1:] or sorted(EUROPEAN_MONARCHIES)
    gather_ancestors(args)
    combine_ancestors(args)
