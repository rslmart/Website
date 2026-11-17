"""Offline tests for the deterministic RoyalTree stages.

Small inline caches only. Every test redirects ``BuildHouses.DATA_DIR`` and
``SplitDataForFrontend``'s data and output directories at a temporary folder,
so nothing is written under ``data/`` or ``public/royalty/`` and no network
is used.

Run from my-app/: uv run --directory src/Royalty/Data --frozen pytest
"""
import gzip
import json

import pytest

import BuildHouses
import Ranks
import SplitDataForFrontend


@pytest.fixture(autouse=True)
def offline_dirs(tmp_path, monkeypatch):
    data = tmp_path / "data"
    public = tmp_path / "out"
    data.mkdir()
    public.mkdir()
    monkeypatch.setattr(BuildHouses, "DATA_DIR", str(data))
    monkeypatch.setattr(SplitDataForFrontend, "DATA_DIR", str(data))
    monkeypatch.setattr(SplitDataForFrontend, "PUBLIC_DIR", str(public))
    return data, public


def person(qid, **fields):
    rec = {"id": qid, "label": fields.pop("label", qid)}
    rec["description"] = fields.pop("description", None)
    for key, value in fields.items():
        rec[key.replace("_", " ")] = value
    return rec


def write_cache(data, people, lists, trees=None, ancestors=None, houses=None):
    (data / "monarchy_data.json").write_text(json.dumps(people), encoding="utf-8")
    (data / "monarch_list.json").write_text(json.dumps(lists), encoding="utf-8")
    if trees is not None:
        (data / "monarchy_family_trees.json").write_text(json.dumps(trees), encoding="utf-8")
    if ancestors is not None:
        (data / "monarchy_ancestors.json").write_text(json.dumps(ancestors), encoding="utf-8")
    if houses is not None:
        (data / "houses.json").write_text(json.dumps(houses), encoding="utf-8")


def read_gz(path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def house_people():
    """Three aliased houses, one house under the size cutoff, and a parent chain."""
    people = {
        "Qh1": person("Qh1", family="Spanish House of Habsburg", occupation=["king"], father="Qp1"),
        "Qh2": person("Qh2", family="House of Habsburg", mother="Qp2",
                      position_held=[{"id": "Q166886", "label": "duke"}]),
        "Qh3": person("Qh3", family="House of Habsburg", description="count palatine", father="Qh1"),
        "Qg1": person("Qg1", family="House of Glücksburg (Denmark)", label="king of Denmark"),
        "Qg2": person("Qg2", family="House of Glücksburg (Norway)"),
        "Qg3": person("Qg3", family="House of Glücksburg", description="count of nowhere"),
        "Qc1": person("Qc1", family="Chingissid", occupation=["khan"]),
        "Qc2": person("Qc2", family="Chingissid"),
        "Qc3": person("Qc3", family="Chingissid", father="Qc1"),
        "Qt1": person("Qt1", family="House of Tiny", occupation=["emperor"]),
        "Qt2": person("Qt2", family="House of Tiny"),
        "Qnone": person("Qnone", occupation=["king"]),
        "Qblank": person("Qblank", family="", occupation=["emperor"]),
        "Qp1": person("Qp1", father="Qp3"),
        "Qp2": person("Qp2", mother="Qp4"),
        "Qp3": person("Qp3", father="Qp5"),
        "Qp4": person("Qp4", label="country estate"),
        "Qp5": person("Qp5", label="too deep"),
    }
    lists = {"Spain": ["Qh1", "Qmissing"], "Norway": ["Qg2"], "Nowhere": ["Qt1"]}
    return people, lists


# --------------------------------------------------------------------------
# Ranks
# --------------------------------------------------------------------------

def test_tier_scale_matches_the_frontend_names():
    assert [Ranks.TIER_EMPEROR, Ranks.TIER_KING, Ranks.TIER_GRAND_DUKE, Ranks.TIER_DUKE,
            Ranks.TIER_PRINCE, Ranks.TIER_COUNT, Ranks.TIER_OTHER] == [6, 5, 4, 3, 2, 1, 0]
    assert set(Ranks.CURATED_TIER.values()) <= set(Ranks.TIER_NAMES)


@pytest.mark.parametrize("text,tier", [
    (None, 0),
    ("", 0),
    ("kingdom", 0),
    ("country", 0),
    ("county", 0),
    ("skiing", 0),
    ("early", 0),
    ("landlord", 0),
    ("consort", 0),
    ("King", 5),
    ("queen regnant", 5),
    ("queen consort", 1),
    ("empress consort", 1),
    ("Empress", 6),
    ("padishah", 6),
    ("tsarina", 6),
    ("kaiser", 6),
    ("high king", 5),
    ("sultan", 5),
    ("shah", 5),
    ("archduke", 4),
    ("prince-elector", 4),
    ("khan", 4),
    ("grand duke", 4),
    ("duke", 3),
    ("prince-bishop", 3),
    ("doge", 3),
    ("count palatine", 2),
    ("palatine", 2),
    ("prince", 2),
    ("marquess", 2),
    ("count", 1),
    ("earl", 1),
    ("baroness", 1),
    ("lady", 1),
    ("castellan", 1),
])
def test_keyword_tier(text, tier):
    assert Ranks.rank_tier({"description": text}) == tier


@pytest.mark.parametrize("qid,tier", [
    ("Q39018", 6),
    ("Q12097", 5),
    ("Q19643", 5),
    ("Q43292", 5),
    ("Q205706", 4),
    ("Q181888", 4),
    ("Q166886", 3),
    ("Q2747456", 2),
    ("Q157802", 2),
    ("Q3519259", 1),
    ("Q719039", 1),
    ("Q2000200", 1),
])
def test_curated_id_scores_without_text(qid, tier):
    assert Ranks.rank_tier({"position held": [{"id": qid}]}) == tier
    assert Ranks.rank_tier({"occupation": [{"id": qid}]}) == tier


def test_consort_titles_stay_at_count():
    queen = {"noble title": [{"id": "Q719039", "label": "queen consort"}]}
    king = {"noble title": [{"id": "Q2000200", "label": "king consort"}]}
    assert Ranks.rank_tier(queen) == Ranks.TIER_COUNT
    assert Ranks.rank_tier(king) == Ranks.TIER_COUNT


def test_rank_is_the_max_across_signals():
    record = {
        "label": "queen consort",
        "description": "kingdom",
        "occupation": ["count", {"id": "Q39018", "label": "emperor"}],
        "position held": [{"id": "Q3519259", "label": "count"}],
        "noble title": [{"label": "duke"}],
    }
    assert Ranks.rank_tier(record) == Ranks.TIER_EMPEROR


def test_consort_cap_does_not_cross_fields():
    # The cap applies to one text chunk. A separate field can still outrank it.
    capped = {"description": "empress consort"}
    split = {"label": "empress consort", "description": "emperor"}
    assert Ranks.rank_tier(capped) == Ranks.TIER_COUNT
    assert Ranks.rank_tier(split) == Ranks.TIER_EMPEROR


def test_non_dict_signals_and_empty_records_are_ignored():
    assert Ranks.rank_tier({}) == Ranks.TIER_OTHER
    assert Ranks.rank_tier({"position held": None, "occupation": None, "label": None}) == 0
    record = {"occupation": ["kingdom", 3, None, {"label": "earl"}], "position held": ["king", None]}
    assert Ranks.rank_tier(record) == Ranks.TIER_COUNT


# --------------------------------------------------------------------------
# BuildHouses
# --------------------------------------------------------------------------

def test_build_houses_merges_aliases_ranks_monarchs_and_ancestors(offline_dirs):
    data, public = offline_dirs
    people, lists = house_people()
    write_cache(data, people, lists)

    houses = BuildHouses.build_houses(min_members=3, ancestor_depth=2)

    assert set(houses) == {"House_of_Habsburg", "House_of_Gl_cksburg", "Borjigin"}
    assert json.loads((data / "houses.json").read_text(encoding="utf-8")) == houses
    assert list(public.iterdir()) == []

    habsburg = houses["House_of_Habsburg"]
    assert habsburg["name"] == "House of Habsburg"
    assert habsburg["members"] == {"Qh1": 5, "Qh2": 3, "Qh3": 2}
    assert habsburg["monarchs"] == ["Qh1"]
    assert list(habsburg["nodes"]) == ["Qh1", "Qh2", "Qh3", "Qp1", "Qp2", "Qp3", "Qp4"]
    assert habsburg["nodes"]["Qh1"]["family"] == "Spanish House of Habsburg"
    assert "Qp5" not in habsburg["nodes"]
    for qid, tier in habsburg["members"].items():
        assert tier == Ranks.rank_tier(people[qid])

    gluck = houses["House_of_Gl_cksburg"]
    assert gluck["name"] == "House of Glücksburg"
    assert gluck["members"] == {"Qg1": 5, "Qg2": 0, "Qg3": 1}
    assert gluck["monarchs"] == ["Qg2"]
    assert gluck["nodes"]["Qg1"]["family"] == "House of Glücksburg (Denmark)"

    borjigin = houses["Borjigin"]
    assert borjigin["name"] == "Borjigin"
    assert borjigin["members"] == {"Qc1": 4, "Qc2": 0, "Qc3": 0}
    assert borjigin["monarchs"] == []
    assert set(borjigin["nodes"]) == {"Qc1", "Qc2", "Qc3"}

    kept = {qid for house in houses.values() for qid in house["members"]}
    assert {"Qt1", "Qt2", "Qnone", "Qblank", "Qp1"}.isdisjoint(kept)


def test_build_houses_threshold_and_depth_are_arguments(offline_dirs):
    data, _public = offline_dirs
    people, lists = house_people()
    write_cache(data, people, lists)

    shallow = BuildHouses.build_houses(min_members=3, ancestor_depth=1)
    assert set(shallow["House_of_Habsburg"]["nodes"]) == {"Qh1", "Qh2", "Qh3", "Qp1", "Qp2"}

    exact = BuildHouses.build_houses(min_members=2, ancestor_depth=0)
    assert set(exact["House_of_Tiny"]["nodes"]) == {"Qt1", "Qt2"}
    assert exact["House_of_Tiny"]["members"]["Qt1"] == Ranks.TIER_EMPEROR
    assert exact["House_of_Tiny"]["monarchs"] == ["Qt1"]
    assert set(exact["House_of_Habsburg"]["nodes"]) == {"Qh1", "Qh2", "Qh3"}


def test_build_houses_ancestor_cycle_stops(offline_dirs):
    data, _public = offline_dirs
    people = {
        "Qa": person("Qa", family="House of Cycle", father="Qb"),
        "Qb": person("Qb", family="House of Cycle", father="Qa"),
    }
    write_cache(data, people, {"Cycle": ["Qa"]})

    houses = BuildHouses.build_houses(min_members=2, ancestor_depth=8)

    assert set(houses) == {"House_of_Cycle"}
    assert set(houses["House_of_Cycle"]["nodes"]) == {"Qa", "Qb"}
    assert houses["House_of_Cycle"]["monarchs"] == ["Qa"]


def test_build_houses_output_is_deterministic(offline_dirs):
    data, _public = offline_dirs
    people, lists = house_people()
    write_cache(data, people, lists)

    first = BuildHouses.build_houses(min_members=3, ancestor_depth=2)
    first_bytes = (data / "houses.json").read_bytes()
    second = BuildHouses.build_houses(min_members=3, ancestor_depth=2)
    assert second == first
    assert (data / "houses.json").read_bytes() == first_bytes


# --------------------------------------------------------------------------
# SplitDataForFrontend
# --------------------------------------------------------------------------

def split_people():
    people = {
        "Q1": person("Q1", label="Anne", father="Q0", mother="Q9", child=["Q2", "Q7"]),
        "Q2": person("Q2", label="Bob", father="Q1", mother="Q3"),
        "Q3": person("Q3", label="Cara"),
        "Q4": person("Q4", label="Dan"),
        "Q7": person("Q7", label="Sibling left out"),
        "Q8": person("Q8", label="Extended only"),
        "Q9": person("Q9", label="Mother of Anne"),
    }
    trees = {"Zeta": [["Q2"]], "Alpha": [["Q1", "Q2"], ["Q2"]], "Mid": [["Q4"]]}
    lists = {"Alpha": ["Q1"], "Nowhere": ["Q8"]}
    ancestors = {"Alpha": ["Q8", "Qmissing", "Q1"], "Mid": [], "Nowhere": ["Q8"]}
    return people, trees, lists, ancestors


def test_split_writes_succession_parents_and_sorted_index(offline_dirs):
    data, public = offline_dirs
    people, trees, lists, ancestors = split_people()
    write_cache(data, people, lists, trees=trees, ancestors=ancestors)

    written = SplitDataForFrontend.split()

    assert written == ["Alpha", "Mid", "Zeta"]
    assert json.loads((public / "index.json").read_text(encoding="utf-8")) == written
    assert sorted(p.name for p in public.iterdir()) == [
        "Alpha.json.gz", "Mid.json.gz", "Zeta.json.gz", "index.json"]

    alpha = read_gz(public / "Alpha.json.gz")
    assert alpha["monarchList"] == ["Q1"]
    assert alpha["successionList"] == [["Q1", "Q2"], ["Q2"]]
    assert list(alpha["nodes"]) == ["Q1", "Q2", "Q3", "Q9"]
    assert list(alpha["extendedNodes"]) == ["Q8", "Q1"]
    assert alpha["nodes"]["Q1"] == people["Q1"]
    assert "Q7" not in alpha["nodes"]
    assert "Q0" not in alpha["nodes"]

    zeta = read_gz(public / "Zeta.json.gz")
    assert zeta["monarchList"] == []
    assert list(zeta["nodes"]) == ["Q1", "Q2", "Q3"]
    assert "extendedNodes" not in zeta
    assert "Q9" not in zeta["nodes"]

    mid = read_gz(public / "Mid.json.gz")
    assert list(mid["nodes"]) == ["Q4"]
    assert "extendedNodes" not in mid
    assert not (public / "Nowhere.json.gz").exists()


def test_split_gzip_bytes_are_deterministic(offline_dirs):
    data, public = offline_dirs
    people, trees, lists, ancestors = split_people()
    write_cache(data, people, lists, trees=trees, ancestors=ancestors)

    SplitDataForFrontend.split()
    first = {path.name: path.read_bytes() for path in public.iterdir()}
    SplitDataForFrontend.split()
    second = {path.name: path.read_bytes() for path in public.iterdir()}

    assert second == first
    raw = first["Alpha.json.gz"]
    assert raw[4:8] == b"\x00\x00\x00\x00"
    assert gzip.decompress(raw) == json.dumps(
        json.loads(gzip.decompress(raw)), separators=(",", ":")).encode()


def test_split_houses_indexes_by_name_and_keeps_the_payload_shape(offline_dirs):
    data, public = offline_dirs
    nodes = {
        "Q1": person("Q1", label="Anne"),
        "Q2": person("Q2", label="Bob"),
        "Q3": person("Q3", label="Cara"),
    }
    houses = {
        "Zee": {"name": "Zee House", "monarchs": ["Q1"],
                "members": {"Q1": 5, "Q2": 0}, "nodes": {"Q2": nodes["Q2"], "Q1": nodes["Q1"]}},
        "Aye": {"name": "Aye House", "members": {"Q3": 1}, "nodes": {"Q3": nodes["Q3"]}},
        "NoName": {"nodes": {"Q9": {"id": "Q9"}}},
    }
    write_cache(data, {}, {}, houses=houses)

    written = SplitDataForFrontend.split_houses()

    assert written == ["Aye", "NoName", "Zee"]
    index = json.loads((public / "houses.json").read_text(encoding="utf-8"))
    assert index == [
        {"id": "Aye", "name": "Aye House"},
        {"id": "NoName", "name": "NoName"},
        {"id": "Zee", "name": "Zee House"},
    ]
    aye = read_gz(public / "Aye.json.gz")
    assert aye == {"type": "house", "monarchList": [], "successionList": [],
                   "members": {"Q3": 1}, "nodes": {"Q3": nodes["Q3"]}}
    zee = read_gz(public / "Zee.json.gz")
    assert zee["type"] == "house"
    assert zee["monarchList"] == ["Q1"]
    assert zee["successionList"] == []
    assert zee["members"] == {"Q1": 5, "Q2": 0}
    assert list(zee["nodes"]) == ["Q2", "Q1"]
    missing = read_gz(public / "NoName.json.gz")
    assert missing["monarchList"] == []
    assert missing["members"] == {}
    assert "name" not in zee


def test_split_houses_skips_when_the_cache_has_none(offline_dirs):
    data, public = offline_dirs
    write_cache(data, {"Q1": person("Q1")}, {"Alpha": ["Q1"]})
    (public / "houses.json").write_text("[]", encoding="utf-8")
    before = {path.name: path.read_bytes() for path in public.iterdir()}

    assert SplitDataForFrontend.split_houses() == []
    assert {path.name: path.read_bytes() for path in public.iterdir()} == before


def test_listed_names_keeps_only_plain_file_stems(offline_dirs):
    data, _public = offline_dirs
    index = data / "index.json"
    index.write_text(json.dumps(["Alpha", "", "a/b", "../x", 3, None, "Beta"]), encoding="utf-8")
    assert SplitDataForFrontend.listed_names(index) == {"Alpha", "Beta"}

    index.write_text(json.dumps({"nope": True}), encoding="utf-8")
    assert SplitDataForFrontend.listed_names(index) == set()

    houses = data / "houses.json"
    houses.write_text(json.dumps([
        {"id": "H"}, {"id": "../z"}, {"name": "no id"}, {"id": ""}, "nope", {"id": "Ok"},
    ]), encoding="utf-8")
    assert SplitDataForFrontend.listed_names(houses, key="id") == {"H", "Ok"}
    assert SplitDataForFrontend.listed_names(data / "missing.json") == set()


def test_prune_deletes_only_stale_indexed_payloads(offline_dirs, tmp_path):
    data, public = offline_dirs
    people, trees, lists, ancestors = split_people()
    aye = {"Aye": {"name": "Aye House", "members": {"Q4": 0},
                   "nodes": {"Q4": people["Q4"]}}}
    write_cache(data, people, lists, trees=trees, ancestors=ancestors, houses=aye)
    (public / "index.json").write_text(
        json.dumps(["Alpha", "Gone", "Ghost", "../outside", "nested/name"]), encoding="utf-8")
    (public / "houses.json").write_text(json.dumps([
        {"id": "OldHouse", "name": "Old"},
        {"id": "Aye", "name": "Aye House"},
        {"id": "../nope", "name": "Bad"},
    ]), encoding="utf-8")
    (public / "Gone.json.gz").write_bytes(b"stale-gone")
    (public / "OldHouse.json.gz").write_bytes(b"stale-house")
    (public / "stray.json.gz").write_bytes(b"keep-me")
    outside = tmp_path / "outside.json.gz"
    outside.write_bytes(b"outside")

    previous = SplitDataForFrontend.published_names()
    assert previous == {"Alpha", "Gone", "Ghost", "OldHouse", "Aye"}
    names = SplitDataForFrontend.split() + SplitDataForFrontend.split_houses()
    removed = SplitDataForFrontend.prune(previous, names)

    assert names == ["Alpha", "Mid", "Zeta", "Aye"]
    assert removed == ["Gone.json.gz", "OldHouse.json.gz"]
    assert not (public / "Gone.json.gz").exists()
    assert not (public / "OldHouse.json.gz").exists()
    assert (public / "stray.json.gz").read_bytes() == b"keep-me"
    assert outside.read_bytes() == b"outside"
    assert json.loads((public / "index.json").read_text(encoding="utf-8")) == ["Alpha", "Mid", "Zeta"]
    assert json.loads((public / "houses.json").read_text(encoding="utf-8")) == [
        {"id": "Aye", "name": "Aye House"}]
    assert not any(path.name.startswith(".tmp-") for path in public.iterdir())


def test_build_then_split_houses_round_trip(offline_dirs):
    data, public = offline_dirs
    people, lists = house_people()
    write_cache(data, people, lists)

    houses = BuildHouses.build_houses(min_members=3, ancestor_depth=2)
    written = SplitDataForFrontend.split_houses()

    assert written == ["Borjigin", "House_of_Gl_cksburg", "House_of_Habsburg"]
    assert not (public / "House_of_Tiny.json.gz").exists()
    for slug in written:
        payload = read_gz(public / f"{slug}.json.gz")
        assert payload["type"] == "house"
        assert payload["successionList"] == []
        assert payload["monarchList"] == houses[slug]["monarchs"]
        assert payload["members"] == houses[slug]["members"]
        assert payload["nodes"] == houses[slug]["nodes"]
        for qid, tier in payload["members"].items():
            assert tier == Ranks.rank_tier(payload["nodes"][qid])
