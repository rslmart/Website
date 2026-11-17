"""Offline validation and data-level diff for the RoyalTree frontend payloads.

Two subcommands, both offline and read-only:

  check  Validate every file in public/royalty/ against a JSON Schema per payload
         type plus cross-record invariants (parents, dates, references, ranks).
         Known current issues are listed in check_allowlist.py; anything else
         fails the check (exit 1).
  diff   Compare public/royalty/ with a baseline (a git ref, default HEAD, or a
         directory) at the data level: per tree, people added/removed/changed
         (with field names), parent and succession edges added/removed, members
         and list order changes. Gzip headers, key order and node order are
         ignored.

Usage (from this directory):
  uv run python validate.py check
  uv run python validate.py diff                 # against HEAD
  uv run python validate.py diff --base master~3
  uv run python validate.py diff --base /path/to/old/royalty
"""
import argparse
import gzip
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict

import Ranks
import check_allowlist
from check_allowlist import ALLOWLIST

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "..", "public", "royalty"))

INDEX = "index.json"
HOUSES_INDEX = "houses.json"

# --------------------------------------------------------------------------
# Schemas (a JSON Schema subset; see _schema_errors for the supported keywords)
# --------------------------------------------------------------------------

QID = {"type": "string", "pattern": r"^Q[1-9][0-9]*$"}
DATE = {"type": "string", "pattern": r"^[+-][0-9]{1,}-[0-9]{2}-[0-9]{2}T00:00:00Z$"}
STR_OR_NULL = {"type": ["string", "null"]}
QID_LIST = {"type": "array", "items": QID}
STR_LIST = {"type": "array", "items": {"type": "string"}}
# Wikidata items labelled to strings by royaltree.wikidata.label_record.
LABEL_LIST = {"type": "array", "items": {"type": "string"}}
QUALIFIED_LIST = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["id"],
        "properties": {
            "id": QID,
            "label": STR_OR_NULL,
            "start time": DATE,
            "end time": DATE,
            # Qualifiers kept by royaltree/wikidata.py parse_person (see P155/P1365 there): predecessors (P1365,
            # P155) as "from" and successors (P1366, P156) as "to" stay Q-IDs;
            # P642/P1001 "of" and P1534 "end cause" are labelled.
            "from": QID_LIST,
            "to": QID_LIST,
            "of": STR_OR_NULL,
            "end cause": STR_OR_NULL,
        },
        "additionalProperties": False,
    },
}

PERSON_SCHEMA = {
    "type": "object",
    "required": ["id", "label", "description"],
    "properties": {
        "id": QID,
        "label": STR_OR_NULL,
        "description": STR_OR_NULL,
        "sex or gender": {"type": "string"},
        "father": QID,
        "mother": QID,
        "date of birth": DATE,
        "date of death": DATE,
        "child": QID_LIST,
        "spouse": QID_LIST,
        "sibling": QID_LIST,
        "unmarried partner": LABEL_LIST,
        "family": STR_OR_NULL,
        "place of birth": STR_OR_NULL,
        "place of death": STR_OR_NULL,
        "place of burial": STR_OR_NULL,
        "cause of death": {"type": "string"},
        "occupation": LABEL_LIST,
        "languages spoken, written or signed": LABEL_LIST,
        "educated at": LABEL_LIST,
        "country of citizenship": LABEL_LIST,
        "religion or worldview": LABEL_LIST,
        "noble title": QUALIFIED_LIST,
        "position held": QUALIFIED_LIST,
        "image": STR_LIST,
        "image of grave": STR_LIST,
        "signature": STR_LIST,
    },
    "additionalProperties": False,
}

PERSON_MAP = {"type": "object", "additionalProperties": PERSON_SCHEMA, "minProperties": 1}

MONARCHY_SCHEMA = {
    "type": "object",
    "required": ["successionList", "monarchList", "nodes"],
    "properties": {
        "successionList": {"type": "array", "minItems": 1,
                           # Empty paths are reported as empty-succession-path.
                           "items": {"type": "array", "items": QID}},
        "monarchList": {"type": "array", "minItems": 1, "items": QID},
        "nodes": PERSON_MAP,
        "extendedNodes": PERSON_MAP,
    },
    "additionalProperties": False,
}

HOUSE_SCHEMA = {
    "type": "object",
    "required": ["type", "monarchList", "successionList", "members", "nodes"],
    "properties": {
        "type": {"enum": ["house"]},
        "monarchList": {"type": "array", "items": QID},
        "successionList": {"type": "array", "maxItems": 0},
        "members": {"type": "object", "minProperties": 1,
                    "additionalProperties": {"type": "integer",
                                             "enum": sorted(Ranks.TIER_NAMES)}},
        "nodes": PERSON_MAP,
    },
    "additionalProperties": False,
}

INDEX_SCHEMA = {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}

HOUSES_INDEX_SCHEMA = {
    "type": "array",
    "minItems": 1,
    "items": {
        "type": "object",
        "required": ["id", "name"],
        "properties": {"id": {"type": "string", "pattern": r"^[0-9A-Za-z_]+$"},
                       "name": {"type": "string", "minLength": 1}},
        "additionalProperties": False,
    },
}

_TYPES = {
    "string": str, "integer": int, "array": list, "object": dict, "null": type(None),
}


def _is_type(value, name):
    if name == "integer" and isinstance(value, bool):
        return False
    return isinstance(value, _TYPES[name])


def _schema_errors(value, schema, path="$"):
    """Yield (path, message) for ``value`` against a JSON Schema subset.

    Supported: type, enum, pattern, minLength, items, minItems, maxItems,
    properties, required, additionalProperties (bool or schema), minProperties.
    """
    types = schema.get("type")
    if types is not None:
        types = [types] if isinstance(types, str) else types
        if not any(_is_type(value, t) for t in types):
            yield path, f"expected {'/'.join(types)}, got {type(value).__name__}"
            return
    if "enum" in schema and value not in schema["enum"]:
        yield path, f"{value!r} not in {schema['enum']}"
    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            yield path, f"{value!r} does not match {schema['pattern']}"
        if len(value) < schema.get("minLength", 0):
            yield path, "empty string"
    elif isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            yield path, f"fewer than {schema['minItems']} items"
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            yield path, f"more than {schema['maxItems']} items"
        if "items" in schema:
            for i, item in enumerate(value):
                yield from _schema_errors(item, schema["items"], f"{path}[{i}]")
    elif isinstance(value, dict):
        if len(value) < schema.get("minProperties", 0):
            yield path, f"fewer than {schema['minProperties']} properties"
        for key in schema.get("required", []):
            if key not in value:
                yield path, f"missing required {key!r}"
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in props:
                yield from _schema_errors(item, props[key], f"{path}.{key}")
            elif extra is False:
                yield path, f"unexpected property {key!r}"
            elif isinstance(extra, dict):
                yield from _schema_errors(item, extra, f"{path}[{key!r}]")


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def _decode(name, blob):
    if name.endswith(".gz"):
        blob = gzip.decompress(blob)
    return json.loads(blob)


def load_dir(path):
    """{filename: parsed JSON} for every .json/.json.gz file in ``path``."""
    out = {}
    for name in sorted(os.listdir(path)):
        if name.endswith((".json", ".json.gz")):
            with open(os.path.join(path, name), "rb") as f:
                out[name] = _decode(name, f.read())
    return out


def load_git(ref, path=PUBLIC_DIR):
    """Like load_dir, but for the files under ``path`` at git ``ref``."""
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=HERE,
                          check=True, capture_output=True, text=True).stdout.strip()
    rel = os.path.relpath(os.path.realpath(path), os.path.realpath(root))
    listing = subprocess.run(["git", "ls-tree", "--name-only", ref, rel + "/"], cwd=root,
                             check=True, capture_output=True, text=True).stdout.split("\n")
    paths = [p for p in listing if p.endswith((".json", ".json.gz"))]
    batch = subprocess.run(["git", "cat-file", "--batch"], cwd=root, check=True,
                           input="".join(f"{ref}:{p}\n" for p in paths).encode(),
                           capture_output=True).stdout
    out, pos = {}, 0
    for p in paths:
        header_end = batch.index(b"\n", pos)
        size = int(batch[pos:header_end].split()[2])
        blob = batch[header_end + 1:header_end + 1 + size]
        pos = header_end + 1 + size + 1
        out[os.path.basename(p)] = _decode(p, blob)
    return out


def payload_kind(name, obj):
    if name == INDEX:
        return "index"
    if name == HOUSES_INDEX:
        return "houses-index"
    if isinstance(obj, dict) and obj.get("type") == "house":
        return "house"
    return "monarchy"


def pool(payload):
    """Every person record in a payload (nodes plus extendedNodes)."""
    merged = dict(payload.get("extendedNodes") or {})
    merged.update(payload.get("nodes") or {})
    return merged


# --------------------------------------------------------------------------
# check
# --------------------------------------------------------------------------

_DATE_RE = re.compile(r"^([+-])([0-9]+)-([0-9]{2})-([0-9]{2})")


def parse_date(value):
    """(year, month, day) from a Wikidata time string; month/day 0 = unknown."""
    m = _DATE_RE.match(value or "")
    if not m:
        return None
    year = int(m.group(2)) * (-1 if m.group(1) == "-" else 1)
    return year, int(m.group(3)), int(m.group(4))


def date_cmp(a, b):
    """-1/0/1 comparing two parsed dates at their shared precision."""
    if a[1] == 0 or b[1] == 0:
        a, b = a[:1], b[:1]
    elif a[2] == 0 or b[2] == 0:
        a, b = a[:2], b[:2]
    return (a > b) - (a < b)


class Report:
    """Violations keyed by (rule, subject), with the files they occur in."""

    def __init__(self):
        self.found = defaultdict(set)
        self.detail = {}

    def add(self, rule, subject, file, detail=""):
        key = (rule, subject)
        self.found[key].add(file)
        self.detail.setdefault(key, detail)


def check_person(rep, name, qid, person, people):
    for path, msg in _schema_errors(person, PERSON_SCHEMA, f"nodes[{qid}]"):
        m = re.match(r"nodes\[[^\]]+\]\.([^\[.]+)", path) or re.search(r"'([^']+)'", msg)
        field = m.group(1) if m else ""
        rep.add("schema-person", f"{qid}:{field}", name, f"{path}: {msg}")
    if person.get("id") != qid:
        rep.add("node-id-mismatch", qid, name, f"key {qid} holds id {person.get('id')}")
    father, mother = person.get("father"), person.get("mother")
    if qid in (father, mother):
        rep.add("self-parent", qid, name)
    if father and father == mother:
        rep.add("father-is-mother", qid, name, f"father and mother are both {father}")
    birth = parse_date(person.get("date of birth"))
    death = parse_date(person.get("date of death"))
    if birth and death and date_cmp(birth, death) > 0:
        rep.add("born-after-death", qid, name,
                f"{person['date of birth']} > {person['date of death']}")
    if birth:
        for role, parent_id in (("father", father), ("mother", mother)):
            parent = people.get(parent_id) if parent_id and parent_id != qid else None
            pbirth = parse_date(parent.get("date of birth")) if parent else None
            if pbirth and date_cmp(pbirth, birth) >= 0:
                rep.add("parent-not-older", f"{qid}<{role}:{parent_id}", name,
                        f"{role} born {parent['date of birth']}, "
                        f"child born {person['date of birth']}")


def check_payload(rep, name, payload, kind):
    schema = HOUSE_SCHEMA if kind == "house" else MONARCHY_SCHEMA
    # Person records are checked one by one in check_person, so the payload
    # pass only checks that the person maps are non-empty objects.
    shallow = {k: ({"type": "object", "minProperties": 1} if v is PERSON_MAP else v)
               for k, v in schema["properties"].items()}
    for path, msg in _schema_errors(payload, {**schema, "properties": shallow}):
        rep.add("schema-payload", f"{name}:{path}", name, msg)
    if not isinstance(payload.get("nodes"), dict):
        return
    people = pool(payload)
    for qid, person in people.items():
        if isinstance(person, dict):
            check_person(rep, name, qid, person, people)
        else:
            rep.add("schema-person", f"{qid}:", name, "not an object")
    nodes = payload["nodes"]
    for qid in payload.get("monarchList", []):
        if qid not in nodes:
            rep.add("monarch-missing", f"{name}:{qid}", name)
    for i, path in enumerate(payload.get("successionList", [])):
        if not path:
            rep.add("empty-succession-path", f"{name}:{i}", name)
        for qid in path:
            if qid not in nodes:
                rep.add("succession-dangling", f"{name}:{qid}", name)
    if kind == "house":
        members = payload.get("members", {})
        for qid, tier in members.items():
            if qid not in nodes:
                rep.add("member-dangling", f"{name}:{qid}", name)
            elif isinstance(nodes[qid], dict) and Ranks.rank_tier(nodes[qid]) != tier:
                rep.add("rank-mismatch", f"{name}:{qid}", name,
                        f"members says {tier}, Ranks.rank_tier gives {Ranks.rank_tier(nodes[qid])}")
        for qid in payload.get("monarchList", []):
            if qid not in members:
                rep.add("monarch-not-member", f"{name}:{qid}", name)


def check_files(files):
    """Run every check over {filename: parsed JSON}; returns a Report."""
    rep = Report()
    index = files.get(INDEX)
    houses = files.get(HOUSES_INDEX)
    if index is None:
        rep.add("index-missing", INDEX, INDEX)
    else:
        for path, msg in _schema_errors(index, INDEX_SCHEMA):
            rep.add("schema-index", f"{INDEX}:{path}", INDEX, msg)
    if houses is not None:
        for path, msg in _schema_errors(houses, HOUSES_INDEX_SCHEMA):
            rep.add("schema-index", f"{HOUSES_INDEX}:{path}", HOUSES_INDEX, msg)

    listed = {}
    for m in index if isinstance(index, list) else []:
        listed[f"{m}.json.gz"] = "monarchy"
    for h in houses if isinstance(houses, list) else []:
        if isinstance(h, dict) and "id" in h:
            listed[f"{h['id']}.json.gz"] = "house"
    for fname, kind in listed.items():
        if fname not in files:
            rep.add("index-dangling", fname, INDEX if kind == "monarchy" else HOUSES_INDEX)
    for lst, label in ((index, INDEX), ([h.get("id") for h in houses or []
                                         if isinstance(h, dict)], HOUSES_INDEX)):
        for item, count in Counter(lst or []).items():
            if count > 1:
                rep.add("index-duplicate", f"{label}:{item}", label)

    shared = {}  # qid -> (canonical JSON, first file), for cross-file consistency
    for name, payload in files.items():
        kind = payload_kind(name, payload)
        if kind in ("index", "houses-index"):
            continue
        if name not in listed:
            rep.add("file-unindexed", name, name)
        elif listed[name] != kind:
            rep.add("file-kind-mismatch", name, name, f"indexed as {listed[name]}, payload is {kind}")
        if not isinstance(payload, dict):
            rep.add("schema-payload", f"{name}:$", name, "not an object")
            continue
        check_payload(rep, name, payload, kind)
        for qid, person in pool(payload).items():
            blob = json.dumps(person, sort_keys=True)
            first = shared.setdefault(qid, (blob, name))
            if first[0] != blob:
                rep.add("person-inconsistent", qid, name, f"differs from {first[1]}")
    return rep


def apply_allowlist(rep, allowlist=ALLOWLIST):
    """Split violations into (failures, allowed, stale allow-list entries)."""
    failures, allowed = {}, {}
    used = set()
    for key, files in rep.found.items():
        rule, subject = key
        entry = allowlist.get(rule)
        if entry and subject in entry["subjects"]:
            allowed[key] = files
            used.add(key)
        else:
            failures[key] = files
    stale = [(rule, s) for rule, entry in allowlist.items()
             for s in entry["subjects"] if (rule, s) not in used]
    return failures, allowed, stale


def run_check(public_dir, verbose=False, as_json=False, update_allowlist=False):
    start = time.monotonic()
    files = load_dir(public_dir)
    rep = check_files(files)
    if update_allowlist:
        bulk = defaultdict(set)
        for rule, subject in rep.found:
            if ALLOWLIST.get(rule, {}).get("bulk"):
                bulk[rule].add(subject)
        check_allowlist.write_bulk(bulk)
        print(f"Rewrote {os.path.basename(check_allowlist._BULK_PATH)}: "
              + ", ".join(f"{r} {len(v)}" for r, v in sorted(bulk.items())))
    failures, allowed, stale = apply_allowlist(rep)
    elapsed = time.monotonic() - start
    if as_json:
        json.dump({"files": len(files),
                   "failures": [{"rule": r, "subject": s, "detail": rep.detail[(r, s)],
                                 "files": sorted(f)} for (r, s), f in sorted(failures.items())],
                   "allowed": len(allowed), "stale": stale}, sys.stdout, indent=1)
        print()
    else:
        trees = sum(1 for n, p in files.items() if payload_kind(n, p) == "monarchy")
        houses = sum(1 for n, p in files.items() if payload_kind(n, p) == "house")
        print(f"Checked {len(files)} files ({trees} trees, {houses} houses) in {elapsed:.1f}s.")
        by_rule = Counter(r for r, _ in allowed)
        if by_rule:
            print("Allowed known issues: " + ", ".join(f"{r} {c}" for r, c in sorted(by_rule.items())))
        if stale:
            print(f"{len(stale)} allow-list entries no longer occur (remove them):")
            for rule, subject in stale:
                print(f"  {rule} {subject}")
        if failures:
            print(f"FAIL: {len(failures)} violations:")
            shown = sorted(failures.items())
            for (rule, subject), fs in shown if verbose else shown[:50]:
                detail = rep.detail[(rule, subject)]
                print(f"  {rule} {subject}: {detail} [{len(fs)} file(s), e.g. {min(fs)}]")
            if not verbose and len(shown) > 50:
                print(f"  ... {len(shown) - 50} more (use --verbose)")
        else:
            print("OK")
    return 1 if failures else 0


# --------------------------------------------------------------------------
# diff
# --------------------------------------------------------------------------

def parent_edges(people):
    """{(child, role, parent)} for father/mother links drawn inside the pool."""
    return {(qid, role, p[role]) for qid, p in people.items() if isinstance(p, dict)
            for role in ("father", "mother") if p.get(role) in people}


def succession_edges(payload):
    return {(a, b) for path in payload.get("successionList", [])
            for a, b in zip(path, path[1:])}


def _canon(value):
    """Order-insensitive form of a field value, for 'same data, new order' tests."""
    if isinstance(value, list):
        return sorted(json.dumps(v, sort_keys=True) for v in value)
    return value


def diff_person(old, new):
    """(changed field names, reordered field names) between two records."""
    changed, reordered = [], []
    for field in sorted(set(old) | set(new)):
        a, b = old.get(field), new.get(field)
        if a == b:
            continue
        if field in old and field in new and _canon(a) == _canon(b):
            reordered.append(field)
        else:
            changed.append(field)
    return changed, reordered


def _list_change(old, new):
    old, new = list(old or []), list(new or [])
    if old == new:
        return None
    to_key = lambda x: json.dumps(x, sort_keys=True)  # noqa: E731
    o, n = Counter(map(to_key, old)), Counter(map(to_key, new))
    added = [json.loads(k) for k in (n - o).elements()]
    removed = [json.loads(k) for k in (o - n).elements()]
    return {"added": added, "removed": removed, "reordered": not added and not removed}


def diff_payload(old, new):
    """Classify the data-level changes between two payloads of one tree."""
    out = {}
    po, pn = pool(old), pool(new)
    added = sorted(set(pn) - set(po))
    removed = sorted(set(po) - set(pn))
    if added:
        out["people_added"] = added
    if removed:
        out["people_removed"] = removed
    changed, reordered = {}, {}
    for qid in sorted(set(po) & set(pn)):
        c, r = diff_person(po[qid], pn[qid])
        if c:
            changed[qid] = c
        if r:
            reordered[qid] = r
    if changed:
        out["people_changed"] = changed
    if reordered:
        out["people_reordered_fields"] = reordered
    moved = sorted(q for q in set(po) & set(pn)
                   if (q in (old.get("nodes") or {})) != (q in (new.get("nodes") or {})))
    if moved:
        out["people_moved_nodes_extended"] = moved
    for label, eo, en in (("parent_edges", parent_edges(po), parent_edges(pn)),
                          ("succession_edges", succession_edges(old), succession_edges(new))):
        if en - eo:
            out[f"{label}_added"] = sorted(en - eo)
        if eo - en:
            out[f"{label}_removed"] = sorted(eo - en)
    for key in ("monarchList", "successionList"):
        change = _list_change(old.get(key), new.get(key))
        if change:
            out[key] = change
    mo, mn = old.get("members") or {}, new.get("members") or {}
    if mo != mn:
        out["members"] = {
            "added": sorted(set(mn) - set(mo)),
            "removed": sorted(set(mo) - set(mn)),
            "rank_changed": {q: [mo[q], mn[q]] for q in sorted(set(mo) & set(mn)) if mo[q] != mn[q]},
        }
    known = {"nodes", "extendedNodes", "successionList", "monarchList", "members"}
    other = sorted(k for k in set(old) | set(new) if k not in known and old.get(k) != new.get(k))
    if other:
        out["other_keys_changed"] = other
    return out


def diff_files(base, current):
    """{filename: change summary} for every file whose data differs."""
    out = {}
    for name in sorted(set(base) | set(current)):
        if name not in base:
            out[name] = {"file": "added"}
        elif name not in current:
            out[name] = {"file": "removed"}
        elif base[name] == current[name]:
            continue
        elif payload_kind(name, current[name]) in ("index", "houses-index"):
            out[name] = {"entries": _list_change(base[name], current[name])}
        elif isinstance(base[name], dict) and isinstance(current[name], dict):
            out[name] = diff_payload(base[name], current[name])
        else:
            out[name] = {"file": "changed type"}
    return out


def _summarize(change):
    parts = []
    for key, value in change.items():
        if isinstance(value, (list, dict)) and key not in ("monarchList", "successionList",
                                                          "members", "entries"):
            parts.append(f"{key} {len(value)}")
        elif isinstance(value, dict):
            bits = [f"+{len(value.get('added', []))}", f"-{len(value.get('removed', []))}"]
            if value.get("reordered"):
                bits.append("reordered")
            if value.get("rank_changed"):
                bits.append(f"rank~{len(value['rank_changed'])}")
            parts.append(f"{key} {' '.join(bits)}")
        else:
            parts.append(f"{key} {value}")
    return "; ".join(parts)


def run_diff(public_dir, base, verbose=False, as_json=False):
    start = time.monotonic()
    current = load_dir(public_dir)
    base_files = load_dir(base) if os.path.isdir(base) else load_git(base, public_dir)
    changes = diff_files(base_files, current)
    elapsed = time.monotonic() - start
    if as_json:
        json.dump({"base": base, "files": len(current), "changed": changes},
                  sys.stdout, indent=1, sort_keys=True)
        print()
        return 0
    print(f"Compared {len(current)} files with {base} ({len(base_files)} files) in {elapsed:.1f}s.")
    if not changes:
        print("No data changes.")
        return 0
    field_counts = Counter(f for c in changes.values()
                           for fields in c.get("people_changed", {}).values() for f in fields)
    print(f"{len(changes)} files with data changes:")
    for name, change in changes.items():
        print(f"  {name}: {_summarize(change)}")
        if verbose:
            print("    " + json.dumps(change, sort_keys=True))
    if field_counts:
        print("Changed fields (person-file pairs): "
              + ", ".join(f"{f} {c}" for f, c in field_counts.most_common()))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--public", default=PUBLIC_DIR, help="payload directory (default: %(default)s)")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("check", "diff"):
        p = sub.add_parser(name)
        p.add_argument("--json", action="store_true", help="machine-readable output")
        p.add_argument("--verbose", "-v", action="store_true", help="list everything")
        if name == "check":
            p.add_argument("--update-allowlist", action="store_true",
                           help="rewrite check_allowlist.json from the current bulk-rule "
                                "violations (review its diff)")
        if name == "diff":
            p.add_argument("--base", default="HEAD",
                           help="git ref or directory to compare against (default: HEAD)")
    args = parser.parse_args(argv)
    if args.command == "check":
        return run_check(args.public, args.verbose, args.json, args.update_allowlist)
    return run_diff(args.public, args.base, args.verbose, args.json)


if __name__ == "__main__":
    sys.exit(main())
