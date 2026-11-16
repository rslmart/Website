"""Unit tests for the royaltree CLI package: store, request hygiene, legacy
import, traversals, order independence and deterministic output.

Inline fixtures only; every test runs with a fake HTTP session (or offline),
so no network is ever touched. Run from Data/: uv run pytest
"""
import gzip
import json
import os
from collections import Counter

import pytest

from royaltree import cli, graph, http, store as store_mod, wikidata
from royaltree.build import combine
from royaltree.legacy import import_legacy
from royaltree.store import Store, StoreLocked, atomic_write


# -- fixtures ------------------------------------------------------------------
def person(qid, label=None, **rel):
    rec = {"id": qid, "label": label or f"P{qid}", "description": None}
    for k, v in rel.items():
        rec[k.replace("_", " ")] = v
    return rec


# A: king Q1 -> son Q2 -> grandson Q3 (tree "Alpha": monarchs Q1, Q3)
# B: Q3's daughter Q4 (tree "Beta": monarchs Q3, Q4); Q3 is shared.
PEOPLE = {
    "Q1": person("Q1", child=["Q2"], family="Q900"),
    "Q2": person("Q2", father="Q1", child=["Q3"], family="Q900"),
    "Q3": person("Q3", father="Q2", child=["Q4"], spouse=["Q5"], family="Q900"),
    "Q4": person("Q4", father="Q3", mother="Q5", family="Q901"),
    "Q5": person("Q5", child=["Q4"]),
}
LABELS = {"Q900": "House A", "Q901": "House B"}
LISTS = {"Alpha": ["Q1", "Q3"], "Beta": ["Q3", "Q4"]}


class FakeResponse:
    def __init__(self, status=200, payload=None, headers=None):
        self.status_code = status
        self._payload = payload or {}
        self.headers = headers or {}
        self.content = json.dumps(self._payload).encode()

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeSession:
    """Records every call; serves wbgetentities from ENTITIES."""

    def __init__(self, entities=None, script=None):
        self.calls = []
        self.entities = entities or {}
        self.script = list(script or [])
        self.headers = {}

    def get(self, url, params=None, headers=None, timeout=None, **kw):
        self.calls.append({"url": url, "params": params, "headers": headers, "timeout": timeout})
        if self.script:
            return self.script.pop(0)
        ids = (params or {}).get("ids", "").split("|")
        ents = {}
        for q in ids:
            if q in self.entities:
                ents[q] = self.entities[q]
            else:
                ents[q] = {"id": q, "missing": ""}
        return FakeResponse(payload={"entities": ents})


def entity(rec, rev=100):
    """A minimal wbgetentities entity that parse_person turns back into ``rec``."""
    claims = {}
    item = lambda q: {"mainsnak": {"datavalue": {"value": {"id": q}}}}
    if "father" in rec:
        claims["P22"] = [item(rec["father"])]
    if "mother" in rec:
        claims["P25"] = [item(rec["mother"])]
    if "child" in rec:
        claims["P40"] = [item(q) for q in rec["child"]]
    if "spouse" in rec:
        claims["P26"] = [item(q) for q in rec["spouse"]]
    if "family" in rec:
        claims["P53"] = [item(rec["family"])]
    return {"id": rec["id"], "lastrevid": rev, "labels": {"en": {"value": rec["label"]}},
            "descriptions": {}, "claims": claims}


@pytest.fixture(autouse=True)
def fake_http(monkeypatch):
    session = FakeSession()
    monkeypatch.setitem(http._state, "session", session)
    monkeypatch.setattr(http, "_sleep", lambda s: None)
    http.configure(offline=False, max_requests=None)
    http.STATS.reset()
    yield session
    http.configure(offline=False, max_requests=None)


@pytest.fixture
def seeded(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "monarch_list.json").write_text(json.dumps(LISTS))
    with Store(str(data_dir)) as s:
        s.put_many("person", PEOPLE, "test")
        s.put_many("label", {**LABELS, **{q: r["label"] for q, r in PEOPLE.items()}}, "test")
    return data_dir


# -- store ---------------------------------------------------------------------
def test_store_roundtrip_and_info(tmp_path):
    with Store(str(tmp_path)) as s:
        s.put_many("person", {"Q1": {"id": "Q1"}}, "wbgetentities", {"Q1": 7}, "2026-01-01T00:00:00Z")
        assert s.get("person", ["Q1", "Q2"]) == {"Q1": {"id": "Q1"}}
        assert s.get("label", ["Q1"]) == {}
        assert s.info("person", ["Q1"])["Q1"][0] == 7
        s.mark_checked("person", {"Q1": 8}, "2026-02-01T00:00:00Z")
        assert s.info("person")["Q1"] == (8, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z")
        s.tree_put("Alpha", {"family_tree": [["Q1"]], "touched": ["Q1"]})
        assert s.trees("touched") == {"Alpha": ["Q1"]}


def test_store_batch_is_all_or_nothing(tmp_path):
    with Store(str(tmp_path)) as s:
        with pytest.raises(TypeError):
            s.put_many("person", {"Q1": {"ok": 1}, "Q2": {"bad": object()}}, "t")
        assert s.count("person") == 0


def test_store_single_writer_lock(tmp_path):
    with Store(str(tmp_path)):
        with pytest.raises(StoreLocked):
            Store(str(tmp_path))
    Store(str(tmp_path)).close()  # lock released


def test_atomic_write_replaces_whole_file(tmp_path):
    p = tmp_path / "x.json"
    atomic_write(str(p), "old")
    atomic_write(str(p), b"new")
    assert p.read_bytes() == b"new"
    assert [f.name for f in tmp_path.iterdir()] == ["x.json"]  # no temp left behind


# -- request hygiene -----------------------------------------------------------
def test_every_request_has_ua_timeout_and_maxlag(fake_http):
    fake_http.entities = {q: entity(r) for q, r in PEOPLE.items()}
    found = wikidata.get_entities([f"Q{i}" for i in range(1, 120)])
    assert set(found) == set(PEOPLE)
    assert len(fake_http.calls) == 3  # 50-ID batches
    for call in fake_http.calls:
        assert call["headers"]["User-Agent"] == "RoyalTreeBot/1.0 (+https://makoa.link)"
        assert call["timeout"]
        assert call["params"]["maxlag"] == http.MAXLAG
    assert http.STATS.requests == 3


def test_caller_cannot_drop_ua(fake_http):
    fake_http.script = [FakeResponse()]
    http.get("https://en.wikipedia.org/wiki/X", headers={"User-Agent": "python-requests"})
    assert fake_http.calls[0]["headers"]["User-Agent"] == http.USER_AGENT


def test_429_maxlag_and_5xx_back_off(fake_http):
    waits = []
    http._sleep = waits.append
    fake_http.script = [
        FakeResponse(429, headers={"Retry-After": "3"}),
        FakeResponse(200, headers={"MediaWiki-API-Error": "maxlag", "Retry-After": "5"}),
        FakeResponse(503),
        FakeResponse(200, payload={"ok": True}),
    ]
    assert http.get_json("https://www.wikidata.org/w/api.php") == {"ok": True}
    assert waits == [3.0, 5.0, 4.0]  # Retry-After honoured; own delay doubled after the 429
    s = http.STATS.as_dict()
    assert (s["requests"], s["429s"], s["maxlag_waits"], s["5xx"]) == (4, 1, 1, 1)


def test_maxlag_has_its_own_patient_budget(fake_http):
    lag = FakeResponse(200, headers={"MediaWiki-API-Error": "maxlag", "Retry-After": "5"})
    fake_http.script = [lag] * 8 + [FakeResponse(payload={"ok": 1})]
    assert http.get_json("https://www.wikidata.org/w/api.php", retries=2) == {"ok": 1}
    assert http.STATS.maxlag == 8
    fake_http.script = [lag] * (http.MAXLAG_RETRIES + 2)
    with pytest.raises(http.FetchError):
        http.get("https://www.wikidata.org/w/api.php", retries=2)


def test_gives_up_after_retries(fake_http):
    fake_http.script = [FakeResponse(429)] * 3
    with pytest.raises(http.FetchError):
        http.get("https://www.wikidata.org/w/api.php", retries=3)


def test_offline_and_request_cap(fake_http):
    http.configure(offline=True)
    with pytest.raises(http.NetworkDisabled):
        http.get("https://www.wikidata.org/w/api.php")
    assert fake_http.calls == []
    http.configure(offline=False, max_requests=1)
    fake_http.script = [FakeResponse(), FakeResponse()]
    http.get("https://a.example/")
    with pytest.raises(http.RequestBudgetExceeded):
        http.get("https://a.example/")


# -- traversals ----------------------------------------------------------------
def test_family_tree_and_ancestors_offline(seeded):
    with Store(str(seeded)) as s:
        r = graph.Retriever(s, offline=True, counters=Counter())
        assert graph.family_tree(LISTS["Alpha"], r) == [["Q1", "Q2", "Q3"], []]
        assert graph.gather_ancestors(["Q4"], r, depth=5, include_siblings=True) == \
            ["Q1", "Q2", "Q3", "Q4", "Q5"]
        r.get_people(["Q404"])
        assert r.absent == {"Q404"} and "Q404" not in r.cache


def test_online_fetch_commits_each_batch(seeded, fake_http):
    fake_http.entities = {"Q6": entity(person("Q6", father="Q3"), rev=55)}
    with Store(str(seeded)) as s:
        c = Counter()
        r = graph.Retriever(s, offline=False, counters=c)
        got = r.get_people(["Q3", "Q6", "Q7"])
        assert got["Q6"]["father"] == "Q3" and got["Q7"] == {}
        assert s.info("person", ["Q6"])["Q6"][0] == 55
        assert s.get("label", ["Q6"]) == {"Q6": "PQ6"}
        assert c["people_fetched"] == 2 and len(fake_http.calls) == 1


# -- legacy import -------------------------------------------------------------
def test_import_legacy_is_offline_and_prefers_published_snapshot(tmp_path):
    legacy = tmp_path / "legacy"
    legacy.mkdir()
    old_q3 = person("Q3", father="Q2")  # stale snapshot in Alpha's cache
    new_q3 = PEOPLE["Q3"]
    (legacy / "Alpha.json").write_text(json.dumps({"Q1": PEOPLE["Q1"], "Q3": new_q3}))
    (legacy / "Beta.json").write_text(json.dumps({"Q3": old_q3, "Q4": PEOPLE["Q4"]}))
    os.utime(legacy / "Alpha.json", (1, 1))  # Beta is newer, but Alpha matches published
    (legacy / "Alpha_ancestors.json").write_text(json.dumps(["Q1"]))
    (legacy / "properties.json").write_text(json.dumps(LABELS))
    published = {"Q3": wikidata.label_record(new_q3, LABELS)}
    (legacy / "monarchy_data.json").write_text(json.dumps(published))
    (legacy / "monarchy_family_trees.json").write_text(json.dumps({"Alpha": [["Q1"]], "Beta": [[]]}))
    http.configure(offline=True)  # any request would raise
    with Store(str(tmp_path / "data")) as s:
        c = Counter()
        import_legacy(s, str(legacy), c)
        assert s.get("person", ["Q3"])["Q3"] == new_q3
        assert c["import_conflict_resolved_by_published"] == 1
        assert s.meta_get("legacy_conflicts") == ["Q3"]  # only Q3 had two snapshots
        assert s.tree_get("Alpha", "ancestors") == ["Q1"]
        assert s.tree_get("Beta", "touched") == ["Q3", "Q4"]
        assert s.info("person", ["Q1"])["Q1"][0] is None  # revision unknown
        assert s.get("label", ["Q900", "Q3"]) == {"Q900": "House A", "Q3": "PQ3"}
    assert http.STATS.requests == 0


def test_refresh_conflicts_refetches_recorded_set_only(tmp_path, fake_http):
    legacy = tmp_path / "legacy"
    legacy.mkdir()
    (legacy / "Alpha.json").write_text(json.dumps({"Q1": PEOPLE["Q1"], "Q3": PEOPLE["Q3"]}))
    (legacy / "Beta.json").write_text(json.dumps({"Q3": person("Q3", father="Q2"),
                                                  "Q4": PEOPLE["Q4"]}))
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "monarch_list.json").write_text(json.dumps(LISTS))
    http.configure(offline=True)
    with Store(str(data_dir)) as s:  # conflicts-only: records the set, imports nothing
        c = Counter()
        import_legacy(s, str(legacy), c, conflicts_only=True)
        assert s.meta_get("legacy_conflicts") == ["Q3"] and s.count("person") == 0
        s.put_many("person", PEOPLE, "legacy:x")  # revision unknown, like an import
    http.configure(offline=False)
    fake_http.entities = {q: entity(r, rev=7) for q, r in PEOPLE.items()}
    run = cli.Run("fetch")
    with Store(str(data_dir)) as s:
        with pytest.raises(SystemExit):
            cli.refresh_conflicts(cli.Run("fetch"), s, max_refetch=0)
        cli.refresh_conflicts(run, s, max_refetch=1)
        info = s.info("person", ["Q1", "Q3"])
        assert (info["Q1"][0], info["Q3"][0]) == (None, 7)  # only the conflicted QID
        n = http.STATS.requests
        cli.refresh_conflicts(cli.Run("fetch"), s, max_refetch=1)  # done: no-op
        assert http.STATS.requests == n
    assert run.counters["conflicts_due"] == 1 and run.counters["people_fetched"] == 1
    with pytest.raises(SystemExit):
        cli.main(["fetch", "--all", "--offline", "--refresh-conflicts",
                  "--data-dir", str(data_dir), "--out-dir", str(tmp_path / "o")])


# -- order independence + determinism ---------------------------------------------
def _build(data_dir, out_dir, *monarchies, extra=()):
    return cli.main(["build", *monarchies, "--offline", "--data-dir", str(data_dir),
                     "--out-dir", str(out_dir), *extra])


def _payload(out_dir, name):
    with gzip.open(os.path.join(out_dir, name + ".json.gz")) as f:
        return json.load(f)


def _snapshot(directory):
    return {f: open(os.path.join(directory, f), "rb").read() for f in sorted(os.listdir(directory))}


def test_build_order_does_not_change_other_trees(tmp_path, seeded):
    import shutil
    other = tmp_path / "data2"
    shutil.copytree(seeded, other)
    _build(seeded, tmp_path / "o1", "Alpha")
    _build(seeded, tmp_path / "o1", "Beta")
    _build(other, tmp_path / "o2", "Beta")
    _build(other, tmp_path / "o2", "Alpha")
    assert _snapshot(tmp_path / "o1") == _snapshot(tmp_path / "o2")
    beta = _payload(tmp_path / "o1", "Beta")
    before = json.dumps(beta, sort_keys=True)
    _build(seeded, tmp_path / "o1", "Alpha")  # rebuilding Alpha leaves Beta alone
    assert json.dumps(_payload(tmp_path / "o1", "Beta"), sort_keys=True) == before
    # Q3 is shared; both trees carry the one store record, labelled.
    alpha = _payload(tmp_path / "o1", "Alpha")
    assert alpha["nodes"]["Q3"] == beta["nodes"]["Q3"]
    assert alpha["nodes"]["Q3"]["family"] == "House A"


def test_rebuild_and_split_are_byte_identical(tmp_path, seeded):
    _build(seeded, tmp_path / "out")
    first = _snapshot(tmp_path / "out")
    _build(seeded, tmp_path / "out")
    assert _snapshot(tmp_path / "out") == first
    cli.main(["split", "--data-dir", str(seeded), "--out-dir", str(tmp_path / "out")])
    assert _snapshot(tmp_path / "out") == first
    assert http.STATS.requests == 0


def test_offline_build_without_list_fails_cleanly(tmp_path):
    with pytest.raises(SystemExit):
        cli.main(["build", "Thailand", "--offline", "--data-dir", str(tmp_path / "d"),
                  "--out-dir", str(tmp_path / "o")])


def test_refresh_refetches_only_changed_and_respects_cap(seeded, fake_http):
    with Store(str(seeded)) as s:
        s.put_many("person", {"Q1": PEOPLE["Q1"], "Q2": PEOPLE["Q2"]}, "t", {"Q1": 1, "Q2": 2})
        s.tree_put("Alpha", {"touched": ["Q1", "Q2", "Q3"]})  # Q3: revision unknown
    fake_http.entities = {"Q1": entity(PEOPLE["Q1"], rev=1), "Q2": entity(PEOPLE["Q2"], rev=9),
                          "Q3": entity(PEOPLE["Q3"], rev=4)}
    run = cli.Run("fetch")
    with Store(str(seeded)) as s:
        with pytest.raises(SystemExit):
            cli.refresh(cli.Run("fetch"), s, ["Alpha"], None, max_refetch=1)
        cli.refresh(run, s, ["Alpha"], None, max_refetch=5)
        info = s.info("person", ["Q1", "Q2", "Q3"])
    assert run.counters["refresh_changed"] == 1 and run.counters["refresh_unknown_revision"] == 1
    assert (info["Q2"][0], info["Q3"][0]) == (9, 4)
