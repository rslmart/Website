"""Build house/family groupings for the frontend house view.

Groups everyone in the combined dataset by house (Wikidata P53 `family`, stored
as a label string in monarchy_data.json), merging obvious spelling/branch
variants via HOUSE_ALIASES. For each house we record:
  - members:  {qid: rankTier}   (rank from Ranks.rank_tier)
  - monarchs: [qid, ...]         (members that appear in any monarch_list, so the
                                  frontend can always show them regardless of the
                                  rank filter)
  - nodes:    {qid: person}      (members PLUS a depth-capped father/mother
                                  ancestor pool, so the frontend can connect any
                                  rank-filtered subset into a compact subtree)

Houses with genuine Wikidata gaps (e.g. the Chinggisid/Borjigin khans, whose
parent links are missing) simply stay disconnected and render as honest
sub-trees; the frontend's component layout tiles them.

Output: data/houses.json = { <slug>: {name, members, monarchs, nodes} }
Run via pipeline.py (after clean_and_combine / combine_ancestors) or standalone.
"""
import json
import os
import re
from collections import defaultdict

import Ranks

DATA_DIR = "./data"

# Only surface houses with at least this many members; below this the house view
# is just noise (788 distinct families exist, most tiny).
MIN_HOUSE_MEMBERS = 20

# How many generations of father/mother ancestors to pull into the pool for
# connecting members. Bounded by what's already in the dataset (no fetching).
ANCESTOR_DEPTH = 8

# Merge clearly-equivalent P53 label variants into one canonical house.
HOUSE_ALIASES = {
    "Chingissid": "Borjigin",
    "House of Glücksburg (Denmark)": "House of Glücksburg",
    "House of Glücksburg (Greece)": "House of Glücksburg",
    "House of Glücksburg (Norway)": "House of Glücksburg",
    "Spanish House of Habsburg": "House of Habsburg",
}


def _slug(name):
    """Filesystem/URL-safe id for a house name (frontend shows it with '_'->' ')."""
    return re.sub(r"[^0-9A-Za-z]+", "_", name).strip("_")


def _ancestor_pool(member_ids, data, depth):
    """Members plus their father/mother ancestors within `data`, depth-capped."""
    pool = set(member_ids)
    frontier = list(member_ids)
    for _ in range(depth):
        nxt = []
        for qid in frontier:
            person = data.get(qid)
            if not person:
                continue
            for parent in (person.get("father"), person.get("mother")):
                if parent and parent in data and parent not in pool:
                    pool.add(parent)
                    nxt.append(parent)
        frontier = nxt
        if not frontier:
            break
    return pool


def build_houses(min_members=MIN_HOUSE_MEMBERS, ancestor_depth=ANCESTOR_DEPTH):
    with open(os.path.join(DATA_DIR, "monarchy_data.json")) as f:
        data = json.load(f)
    with open(os.path.join(DATA_DIR, "monarch_list.json")) as f:
        monarch_lists = json.load(f)

    monarch_ids = set()
    for ids in monarch_lists.values():
        monarch_ids.update(ids)

    groups = defaultdict(list)
    for qid, person in data.items():
        family = person.get("family")
        if not family:
            continue
        canon = HOUSE_ALIASES.get(family, family)
        groups[canon].append(qid)

    houses = {}
    for canon, member_ids in groups.items():
        if len(member_ids) < min_members:
            continue
        slug = _slug(canon)
        members = {qid: Ranks.rank_tier(data[qid]) for qid in member_ids}
        monarchs = [qid for qid in member_ids if qid in monarch_ids]
        pool = _ancestor_pool(member_ids, data, ancestor_depth)
        nodes = {qid: data[qid] for qid in pool if qid in data}
        houses[slug] = {
            "name": canon,
            "members": members,
            "monarchs": monarchs,
            "nodes": nodes,
        }

    with open(os.path.join(DATA_DIR, "houses.json"), "w") as f:
        json.dump(houses, f)

    print(f"Built {len(houses)} houses (>= {min_members} members):")
    for slug in sorted(houses, key=lambda s: -len(houses[s]["members"]))[:25]:
        h = houses[slug]
        print(f"  {h['name']}: {len(h['members'])} members, "
              f"{len(h['monarchs'])} monarchs, {len(h['nodes'])} nodes")
    return houses


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    build_houses()
