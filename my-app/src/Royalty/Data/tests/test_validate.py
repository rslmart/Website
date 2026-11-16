"""Unit tests for validate.py (check invariants and the diff classifier).

Tiny inline fixtures only; no network and no access to public/royalty/.
Run from Data/: uv run pytest
"""
import copy
import gzip
import json

import pytest

import Ranks
import SplitDataForFrontend
import validate


def person(qid, **fields):
    rec = {"id": qid, "label": f"Person {qid}", "description": None}
    for key, value in fields.items():
        rec[key.replace("_", " ")] = value
    return rec


def tree():
    """A valid two-generation monarchy payload."""
    return {
        "successionList": [["Q1", "Q3"]],
        "monarchList": ["Q1", "Q3"],
        "nodes": {
            "Q1": person("Q1", date_of_birth="+1000-05-01T00:00:00Z",
                         date_of_death="+1050-00-00T00:00:00Z", child=["Q3"]),
            "Q2": person("Q2", date_of_birth="+1005-00-00T00:00:00Z", child=["Q3"]),
            "Q3": person("Q3", father="Q1", mother="Q2",
                         date_of_birth="+1030-02-03T00:00:00Z",
                         position_held=[{"id": "Q9", "label": "king",
                                         "start time": "+1050-00-00T00:00:00Z",
                                         "from": ["Q1"]}]),
        },
    }


def house():
    nodes = {"Q1": tree()["nodes"]["Q1"], "Q4": person("Q4", description="duke of Somewhere")}
    return {"type": "house", "monarchList": ["Q1"], "successionList": [],
            "members": {q: Ranks.rank_tier(p) for q, p in nodes.items()}, "nodes": nodes}


def files(**payloads):
    out = {"index.json": sorted(k for k in payloads if k != "H"),
           "houses.json": [{"id": "H", "name": "House H"}] if "H" in payloads else []}
    for name, payload in payloads.items():
        out[f"{name}.json.gz"] = payload
    if not out["houses.json"]:
        del out["houses.json"]
    return out


def rules(payloads):
    return {rule for rule, _ in validate.check_files(payloads).found}


# --------------------------------------------------------------------------
# check
# --------------------------------------------------------------------------

def test_valid_fixture_passes():
    assert rules(files(T=tree(), H=house())) == set()


@pytest.mark.parametrize("mutate, rule", [
    (lambda t: t["nodes"]["Q3"].update(father="Q3"), "self-parent"),
    (lambda t: t["nodes"]["Q3"].update(mother="Q1"), "father-is-mother"),
    (lambda t: t["nodes"]["Q1"].update({"date of death": "+0999-00-00T00:00:00Z"}),
     "born-after-death"),
    (lambda t: t["nodes"]["Q2"].update({"date of birth": "+1031-00-00T00:00:00Z"}),
     "parent-not-older"),
    (lambda t: t["nodes"]["Q2"].update({"date of birth": "+1030-00-00T00:00:00Z"}),
     "parent-not-older"),  # same year at year precision is not "before"
    (lambda t: t["monarchList"].append("Q7"), "monarch-missing"),
    (lambda t: t["successionList"].append(["Q1", "Q8"]), "succession-dangling"),
    (lambda t: t["successionList"].append([]), "empty-succession-path"),
    (lambda t: t["nodes"]["Q2"].update(id="Q22"), "node-id-mismatch"),
    (lambda t: t["nodes"]["Q2"].update(father="X1"), "schema-person"),
    (lambda t: t["nodes"]["Q2"].update(occupation=["king", None]), "schema-person"),
    (lambda t: t["nodes"]["Q2"].update(nickname="x"), "schema-person"),
    (lambda t: t["nodes"]["Q3"]["position held"][0].update(extra=1), "schema-person"),
    (lambda t: t.update(monarchList=[]), "schema-payload"),
    (lambda t: t.update(successionList=[]), "schema-payload"),
    (lambda t: t.update(extendedNodes={}), "schema-payload"),
    (lambda t: t.update(colour="red"), "schema-payload"),
])
def test_tree_invariants(mutate, rule):
    t = tree()
    mutate(t)
    assert rule in rules(files(T=t))


def test_date_precision():
    p = validate.parse_date
    assert p("-0050-00-00T00:00:00Z") == (-50, 0, 0)
    assert validate.date_cmp(p("+1000-05-01T00:00:00Z"), p("+1000-00-00T00:00:00Z")) == 0
    assert validate.date_cmp(p("+1000-05-01T00:00:00Z"), p("+1000-05-00T00:00:00Z")) == 0
    assert validate.date_cmp(p("+1000-05-02T00:00:00Z"), p("+1000-05-01T00:00:00Z")) == 1
    assert validate.date_cmp(p("-0100-00-00T00:00:00Z"), p("+0001-00-00T00:00:00Z")) == -1


def test_parent_order_uses_extended_nodes():
    t = tree()
    t["extendedNodes"] = {"Q5": person("Q5", date_of_birth="+1040-00-00T00:00:00Z")}
    t["nodes"]["Q2"]["father"] = "Q5"
    assert "parent-not-older" in rules(files(T=t))


@pytest.mark.parametrize("mutate, rule", [
    (lambda h: h["members"].update(Q9=0), "member-dangling"),
    (lambda h: h["members"].update(Q4=(h["members"]["Q4"] + 1) % 7), "rank-mismatch"),
    (lambda h: h["members"].update(Q4=9), "schema-payload"),
    (lambda h: h["monarchList"].append("Q4") or h["members"].pop("Q4"), "monarch-not-member"),
    (lambda h: h.update(successionList=[["Q1"]]), "schema-payload"),
])
def test_house_invariants(mutate, rule):
    h = house()
    mutate(h)
    assert rule in rules(files(T=tree(), H=h))


def test_index_and_cross_file_rules():
    f = files(T=tree())
    f["index.json"].append("Missing")
    f["Stray.json.gz"] = tree()
    other = tree()
    other["nodes"]["Q1"]["label"] = "Someone else"
    f["index.json"].append("U")
    f["U.json.gz"] = other
    assert {"index-dangling", "file-unindexed", "person-inconsistent"} <= rules(f)


def test_allowlist_split():
    t = tree()
    t["nodes"]["Q3"]["father"] = "Q3"
    t["nodes"]["Q2"]["mother"] = "Q2"
    rep = validate.check_files(files(T=t))
    allow = {"self-parent": {"reason": "test", "subjects": {"Q3", "Q99"}}}
    failures, allowed, stale = validate.apply_allowlist(rep, allow)
    assert set(allowed) == {("self-parent", "Q3")}
    assert set(failures) == {("self-parent", "Q2")}
    assert stale == [("self-parent", "Q99")]


# --------------------------------------------------------------------------
# diff
# --------------------------------------------------------------------------

def test_diff_ignores_key_and_node_order():
    a = tree()
    b = json.loads(json.dumps(a, sort_keys=True))
    b["nodes"] = dict(reversed(list(b["nodes"].items())))
    assert validate.diff_files(files(T=a), files(T=b)) == {}


def test_diff_ignores_gzip_bytes(tmp_path):
    raw = json.dumps(tree()).encode()
    for sub, mtime in (("a", 0), ("b", 12345)):
        (tmp_path / sub).mkdir()
        with gzip.GzipFile(tmp_path / sub / "T.json.gz", "wb", mtime=mtime) as f:
            f.write(raw)
    a, b = validate.load_dir(tmp_path / "a"), validate.load_dir(tmp_path / "b")
    assert (tmp_path / "a" / "T.json.gz").read_bytes() != (tmp_path / "b" / "T.json.gz").read_bytes()
    assert validate.diff_files(a, b) == {}


def test_diff_classifies_people_and_edges():
    old, new = tree(), tree()
    new["nodes"]["Q4"] = person("Q4", father="Q3")         # added, new parent edge
    del new["nodes"]["Q2"]                                  # removed, mother edge gone
    new["nodes"]["Q1"]["label"] = "Renamed"                 # changed field
    new["nodes"]["Q1"]["child"] = ["Q3", "Q4"]              # changed list
    new["nodes"]["Q3"]["position held"][0]["from"] = ["Q1"]  # unchanged
    d = validate.diff_payload(old, new)
    assert d["people_added"] == ["Q4"]
    assert d["people_removed"] == ["Q2"]
    assert d["people_changed"] == {"Q1": ["child", "label"]}
    assert d["parent_edges_added"] == [("Q4", "father", "Q3")]
    assert d["parent_edges_removed"] == [("Q3", "mother", "Q2")]
    assert "succession_edges_added" not in d


def test_diff_order_changes():
    old, new = tree(), tree()
    old["nodes"]["Q1"]["child"] = ["Q3", "Q2"]
    new["nodes"]["Q1"]["child"] = ["Q2", "Q3"]
    new["monarchList"].reverse()
    new["successionList"] = [["Q3", "Q1"]]
    d = validate.diff_payload(old, new)
    assert d["people_reordered_fields"] == {"Q1": ["child"]}
    assert "people_changed" not in d
    assert d["monarchList"] == {"added": [], "removed": [], "reordered": True}
    assert d["successionList"]["reordered"] is False
    assert d["succession_edges_added"] == [("Q3", "Q1")]
    assert d["succession_edges_removed"] == [("Q1", "Q3")]


def test_diff_members_files_and_index():
    old_h, new_h = house(), house()
    new_h["members"]["Q4"] += 1
    new_h["members"]["Q5"] = 0
    new_h["nodes"]["Q5"] = person("Q5")
    base = files(T=tree(), H=old_h)
    cur = files(T=tree(), H=new_h, V=tree())
    d = validate.diff_files(base, cur)
    assert d["V.json.gz"] == {"file": "added"}
    assert d["index.json"]["entries"]["added"] == ["V"]
    m = d["H.json.gz"]["members"]
    assert m["added"] == ["Q5"] and m["removed"] == []
    assert m["rank_changed"] == {"Q4": [old_h["members"]["Q4"], new_h["members"]["Q4"]]}
    assert "T.json.gz" not in d
    assert validate.diff_files(cur, base)["V.json.gz"] == {"file": "removed"}


def test_diff_moved_between_sections():
    old = tree()
    new = copy.deepcopy(old)
    new["extendedNodes"] = {"Q2": new["nodes"].pop("Q2")}
    d = validate.diff_payload(old, new)
    assert d == {"people_moved_nodes_extended": ["Q2"]}


# --------------------------------------------------------------------------
# determinism of the writer
# --------------------------------------------------------------------------

def test_write_gz_is_byte_deterministic(tmp_path):
    a, b = tmp_path / "a.json.gz", tmp_path / "b" / "a.json.gz"
    b.parent.mkdir()
    SplitDataForFrontend._write_gz(str(a), tree())
    SplitDataForFrontend._write_gz(str(b), tree())
    assert a.read_bytes() == b.read_bytes()
    assert a.read_bytes()[4:8] == b"\0\0\0\0"  # gzip mtime field


def test_important_nodes_sorted():
    data = {q: person(q) for q in ("Q9", "Q1", "Q5")}
    data["Q5"]["father"] = "Q9"
    data["Q5"]["mother"] = "Q1"
    nodes = SplitDataForFrontend._important_nodes([["Q5"]], data)
    assert list(nodes) == ["Q1", "Q5", "Q9"]
