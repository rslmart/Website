"""Offline tests for the WDQS typed-record fetcher.

No test opens a socket. Live Wikidata edits are reported by
``python -m royaltree.wdqs_drift``, not by these assertions.
"""
import json
from pathlib import Path

import pytest

from royaltree import http, wikidata, wdqs
from royaltree.store import Store

PINNED_PATH = Path(__file__).resolve().parent / "fixtures" / "wdqs_pinned.json"
WD = "http://www.wikidata.org/entity/"
RANK = {
    "preferred": "http://wikiba.se/ontology#PreferredRank",
    "normal": "http://wikiba.se/ontology#NormalRank",
    "deprecated": "http://wikiba.se/ontology#DeprecatedRank",
}


def uri(value):
    return {"type": "uri", "value": value}


def lit(value):
    return {"type": "literal", "value": str(value)}


def row(qid, pid, *, rank="normal", snak="value", value=None, time=None, precision=None,
        stmt=None, start=None, start_prec=None, end=None, end_prec=None):
    stmt = stmt or f"{WD}statement/{qid}-{pid}-{rank}-{snak}-{value or time or 'x'}"
    binding = {
        "item": uri(WD + qid),
        "stmt": uri(stmt),
        "pid": lit(pid),
        "rank": uri(RANK[rank]),
        "snak": lit(snak),
    }
    if value:
        binding["value"] = uri(WD + value)
    if time:
        binding["time"] = lit(time)
    if precision is not None:
        binding["precision"] = lit(precision)
    if start is not None:
        binding["start"] = lit(start)
        binding["startPrec"] = lit(start_prec)
    if end is not None:
        binding["end"] = lit(end)
        binding["endPrec"] = lit(end_prec)
    return binding


def sparql(rows):
    return {"head": {"vars": []}, "results": {"bindings": rows}}


def parsed(rows, qids):
    return wdqs.parse_typed(sparql(rows), qids)


class FakeResponse:
    def __init__(self, status=200, payload=None, headers=None, text=""):
        self.status_code = status
        self._payload = payload if payload is not None else {}
        self.headers = headers or {}
        self.text = text
        self.content = b""

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def empty_sparql():
    return FakeResponse(payload={"head": {"vars": []}, "results": {"bindings": []}})


class FakeSession:
    def __init__(self):
        self.calls = []
        self.script = []
        self.headers = {}

    def _next(self, method):
        if self.script:
            return self.script.pop(0)
        if method == "post":
            return empty_sparql()
        return FakeResponse(payload={"entities": {}})

    def post(self, url, params=None, data=None, headers=None, timeout=None, **kw):
        self.calls.append({"method": "post", "url": url, "params": params, "data": data,
                           "headers": headers, "timeout": timeout})
        return self._next("post")

    def get(self, url, params=None, data=None, headers=None, timeout=None, **kw):
        self.calls.append({"method": "get", "url": url, "params": params, "data": data,
                           "headers": headers, "timeout": timeout})
        return self._next("get")


@pytest.fixture
def fake_http(monkeypatch):
    session = FakeSession()
    monkeypatch.setitem(http._state, "session", session)
    monkeypatch.setattr(http, "_sleep", lambda seconds: None)
    http.configure(offline=False, max_requests=None)
    http.STATS.reset()
    yield session
    http.configure(offline=False, max_requests=None)


@pytest.fixture(scope="module")
def pinned():
    return json.loads(PINNED_PATH.read_text())


# -- rank, ties, unknown values, property survival -----------------------------
def test_preferred_mother_beats_normal():
    rows = [
        row("Q462856", "P25", rank="normal", value="Q21155612", stmt="n"),
        row("Q462856", "P25", rank="preferred", value="Q96088549", stmt="p"),
    ]
    mother = parsed(rows, ["Q462856"])["Q462856"]["mother"]
    assert mother == {"rank": "preferred", "value": {"id": "Q96088549"}}


def test_deprecated_mother_is_absent():
    rows = [row("Q259077", "P25", rank="deprecated", value="Q96075335")]
    assert "mother" not in parsed(rows, ["Q259077"])["Q259077"]


def test_tie_is_explicit_and_not_the_first_claim():
    rows = [
        row("Q1", "P22", value="Q2", stmt="a"),
        row("Q1", "P22", value="Q3", stmt="b"),
    ]
    father = parsed(rows, ["Q1"])["Q1"]["father"]
    assert father["tie"] is True
    assert "value" not in father
    assert {item["id"] for item in father["values"]} == {"Q2", "Q3"}


def test_preferred_unknown_is_not_replaced_by_a_normal_value():
    rows = [
        row("Q1", "P22", rank="normal", value="Q2", stmt="a"),
        row("Q1", "P22", rank="preferred", snak="somevalue", stmt="b"),
    ]
    assert parsed(rows, ["Q1"])["Q1"]["father"] == {"rank": "preferred", "unknown": True}


def test_unknown_only_is_recorded():
    rows = [row("Q1", "P25", snak="somevalue", stmt="u")]
    assert parsed(rows, ["Q1"])["Q1"]["mother"] == {"rank": "normal", "unknown": True}


def test_somevalue_does_not_drop_q215224_birth_or_q170470_death():
    rows = [
        row("Q215224", "P569", snak="somevalue", stmt="b-unknown"),
        row("Q215224", "P569", snak="value", time="+1400-01-01T00:00:00Z", precision=9, stmt="b-value"),
        row("Q170470", "P570", snak="somevalue", stmt="d-unknown"),
        row("Q170470", "P570", snak="value", time="+1500-01-01T00:00:00Z", precision=9, stmt="d-value"),
    ]
    got = parsed(rows, ["Q215224", "Q170470"])
    birth = got["Q215224"]["date of birth"]
    death = got["Q170470"]["date of death"]
    assert birth["value"] == {"time": "+1400-01-01T00:00:00Z", "precision": 9}
    assert birth["unknown"] is True
    assert death["value"]["precision"] == 9
    assert death["unknown"] is True


def test_lower_rank_somevalue_does_not_drop_the_value():
    rows = [
        row("Q1", "P569", rank="normal", snak="somevalue", stmt="u"),
        row("Q1", "P569", rank="preferred", snak="value", time="1500-01-01T00:00:00Z", precision=9, stmt="v"),
    ]
    birth = parsed(rows, ["Q1"])["Q1"]["date of birth"]
    assert birth["rank"] == "preferred"
    assert birth["value"]["precision"] == 9
    assert "unknown" not in birth


def test_one_bad_date_claim_does_not_drop_the_property():
    rows = [
        row("Q1", "P569", snak="value", time="not-a-time", precision=9, stmt="bad"),
        row("Q1", "P569", snak="value", time="1501-01-01T00:00:00Z", precision=9, stmt="good"),
    ]
    birth = parsed(rows, ["Q1"])["Q1"]["date of birth"]
    assert birth["value"]["time"] == "1501-01-01T00:00:00Z"
    assert "tie" not in birth


def test_novalue_snak_does_not_drop_a_real_value():
    rows = [
        row("Q1", "P22", snak="novalue", stmt="n"),
        row("Q1", "P22", value="Q2", stmt="v"),
    ]
    assert parsed(rows, ["Q1"])["Q1"]["father"]["value"]["id"] == "Q2"


def test_same_qid_as_both_parents_is_kept():
    rows = [
        row("Q3495067", "P22", value="Q103560123", stmt="f"),
        row("Q3495067", "P25", value="Q103560123", stmt="m"),
    ]
    rec = parsed(rows, ["Q3495067"])["Q3495067"]
    assert rec["father"]["value"]["id"] == rec["mother"]["value"]["id"] == "Q103560123"


def test_open_position_is_kept_with_its_rank_and_closed_history():
    rows = [
        row("Q43274", "P39", rank="preferred", value="Q9134365", stmt="open",
            start="2022-09-08T00:00:00Z", start_prec=11),
        row("Q43274", "P39", rank="normal", value="Q2", stmt="closed",
            start="1950-01-01T00:00:00Z", start_prec=11,
            end="2022-09-08T00:00:00Z", end_prec=11),
        row("Q43274", "P39", rank="deprecated", value="Q3", stmt="old"),
    ]
    positions = parsed(rows, ["Q43274"])["Q43274"]["position held"]
    assert [item["id"] for item in positions] == ["Q9134365", "Q2"]
    assert "end" not in positions[0]
    assert positions[0]["start"] == {"time": "2022-09-08T00:00:00Z", "precision": 11}
    assert positions[0]["rank"] == "preferred"
    assert positions[1]["end"]["precision"] == 11


def test_multi_valued_history_keeps_normal_and_preferred():
    rows = [
        row("Q1", "P26", rank="preferred", value="Q2", stmt="a"),
        row("Q1", "P26", rank="normal", value="Q3", stmt="b"),
        row("Q1", "P26", rank="deprecated", value="Q4", stmt="c"),
        row("Q1", "P40", value="Q5", stmt="d"),
        row("Q1", "P3373", value="Q6", stmt="e"),
        row("Q1", "P97", rank="normal", value="Q7", stmt="f"),
    ]
    rec = parsed(rows, ["Q1"])["Q1"]
    assert [item["id"] for item in rec["spouse"]] == ["Q2", "Q3"]
    assert [item["rank"] for item in rec["spouse"]] == ["preferred", "normal"]
    assert rec["child"] == [{"rank": "normal", "id": "Q5"}]
    assert rec["sibling"][0]["id"] == "Q6"
    assert rec["noble title"][0]["id"] == "Q7"


def test_parse_person_remains_the_legacy_first_claim_parser(capsys):
    item = {
        "id": "Q462856",
        "labels": {"en": {"value": "Ealdgyth"}},
        "descriptions": {"en": {"value": ""}},
        "claims": {
            "P25": [
                {"mainsnak": {"datavalue": {"value": {"id": "Q21155612"}}}},
                {"mainsnak": {"datavalue": {"value": {"id": "Q96088549"}}}},
            ],
            "P569": [
                {"mainsnak": {"snaktype": "somevalue"}},
                {"mainsnak": {"datavalue": {"value": {"time": "+1400-00-00T00:00:00Z"}}}},
            ],
        },
    }
    person = wikidata.parse_person(item)
    assert person["mother"] == "Q21155612"
    assert "date of birth" not in person
    capsys.readouterr()


# -- dates ---------------------------------------------------------------------
def test_format_date_century_decade_and_bce():
    century = wdqs.format_date({"time": "+1100-00-00T00:00:00Z", "precision": 7})
    assert century == "c. 12th century"
    assert "1100-1100" not in century
    assert wdqs.format_date({"time": "1100-01-01T00:00:00Z", "precision": 7}) == "c. 12th century"
    assert wdqs.format_date({"time": "2000-01-01T00:00:00Z", "precision": 7}) == "c. 21st century"
    decade = wdqs.format_date({"time": "+0990-01-01T00:00:00Z", "precision": 8})
    assert decade == "990s"
    assert "/" not in decade
    assert wdqs.format_date({"time": "1990-01-01T00:00:00Z", "precision": 8}) == "1990s"
    assert wdqs.format_date({"time": "+0000-00-00T00:00:00Z", "precision": 9}) == "1 BCE"
    assert wdqs.format_date({"time": "+0000-00-00T00:00:00Z", "precision": 11}) == "1 BCE"
    assert wdqs.format_date({"time": "+0000-00-00T00:00:00Z", "precision": 7}) == "c. 1st century"
    assert wdqs.format_date({"time": "+0000-00-00T00:00:00Z", "precision": 8}) == "0s"
    assert wdqs.format_date({"time": "+0000-00-00T00:00:00Z", "precision": 6}) == "c. 1st millennium"
    assert wdqs.format_date({"time": "-0043-03-15T00:00:00Z", "precision": 11}) == "15 March 44 BCE"
    assert wdqs.format_date({"time": "+0044-03-15T00:00:00Z", "precision": 11}) == "15 March 44"
    assert wdqs.format_date({"time": "-0100-01-01T00:00:00Z", "precision": 7}) == "c. 2nd century BCE"
    assert wdqs.format_date({"time": "2022-09-08T00:00:00Z", "precision": 11}) == "8 September 2022"
    with pytest.raises(ValueError):
        wdqs.format_date("+1100-00-00T00:00:00Z")


# -- pinned fixture ------------------------------------------------------------
def _snaks(pinned_doc, qid, pid):
    found = []
    for binding in pinned_doc["results"]["results"]["bindings"]:
        if binding["item"]["value"].endswith("/" + qid) and binding["pid"]["value"] == pid:
            found.append(binding["snak"]["value"])
    return found


def test_pinned_cases(pinned):
    assert pinned["checked"] == "2026-11-17"
    records = wdqs.parse_typed(pinned["results"], list(pinned["expect"]))
    assert wdqs.assess(records, pinned["expect"]) == []
    # The same item is both parents, and both fields are present.
    both = records["Q3495067"]
    assert both["father"]["value"]["id"] == both["mother"]["value"]["id"] == "Q103560123"
    # A somevalue snak is in the pin, and the real date is still there.
    assert "somevalue" in _snaks(pinned, "Q215224", "P569")
    assert "value" in records["Q215224"]["date of birth"]
    death = records["Q215224"]["date of death"]
    assert death.get("tie") is True and "value" not in death
    assert "somevalue" in _snaks(pinned, "Q170470", "P570")
    assert "value" in records["Q170470"]["date of death"]
    uk = [p for p in records["Q43274"]["position held"] if p.get("id") == "Q9134365"]
    assert uk and "end" not in uk[0] and uk[0]["start"]["time"].startswith("2022")
    assert any("end" not in p and p["start"]["time"].startswith("1973")
               for p in records["Q45068"]["position held"])


# -- client --------------------------------------------------------------------
def test_queries_are_sequential_batches_without_best_rank_only():
    texts = wdqs.queries_for(["Q43274", "Q45068"])
    names = [text.split("# royaltree wdqs ", 1)[1].split("\n", 1)[0] for text in texts]
    assert names == ["facts", "dates", "positions"]
    joined = "\n".join(texts)
    assert "BestRank" not in joined
    assert joined.count("{") == joined.count("}")
    assert "DeprecatedRank" in joined and "isSomeValue" in joined
    assert "timeValue" not in texts[0] and "P40" in texts[0] and "P22" in texts[0]
    assert "wikibase:timeValue" in texts[1]
    assert "OPTIONAL" in texts[2] and "pqv:P582" in texts[2]
    inverse = wdqs.inverse_query(["Q1"])
    assert "BestRank" not in inverse and "DeprecatedRank" in inverse
    assert "P22" in inverse and "P25" in inverse and "P40" in inverse
    assert "wd:Q43274" in texts[0] and "wd:Q45068" in texts[0]
    with pytest.raises(ValueError):
        wdqs.queries_for(["Q1; DROP"])


def test_walk_groups_keep_time_value_off_the_facts_query():
    facts = wdqs.queries_for(["Q43274"], groups=("facts",))
    assert len(facts) == 1
    assert "timeValue" not in facts[0]
    assert "P22" in facts[0] and "P25" in facts[0] and "P40" in facts[0] and "P3373" in facts[0]
    later = wdqs.queries_for(["Q43274"], groups=("positions", "dates"))
    names = [text.split("# royaltree wdqs ", 1)[1].split("\n", 1)[0] for text in later]
    assert names == ["dates", "positions"]
    assert "wikibase:timeValue" in later[0]
    assert "pqv:P582" in later[1]
    with pytest.raises(ValueError):
        wdqs.queries_for(["Q1"], groups=("timeValue",))


def test_fetch_posts_in_batches_of_about_400(fake_http):
    wdqs.fetch_typed([f"Q{i}" for i in range(1, 402)])
    assert len(fake_http.calls) == 6  # 2 batches x 3 queries, in order
    first = fake_http.calls[0]
    assert first["method"] == "post"
    assert first["url"] == wdqs.ENDPOINT
    assert first["headers"]["User-Agent"] == http.USER_AGENT
    assert first["headers"]["Accept"] == wdqs.ACCEPT
    assert first["timeout"] == http.DEFAULT_TIMEOUT
    assert "query" in first["data"]
    assert "wd:Q400" in first["data"]["query"] and "wd:Q401" not in first["data"]["query"]
    second_batch = fake_http.calls[3]["data"]["query"]
    assert "wd:Q401" in second_batch and "wd:Q400" not in second_batch
    assert http.STATS.requests == 6
    names = []
    for call in fake_http.calls[:3]:
        names.append(call["data"]["query"].split("# royaltree wdqs ", 1)[1].split("\n", 1)[0])
    assert names == ["facts", "dates", "positions"]


def test_facts_during_the_walk_are_one_query_and_the_tail_stays_at_400(fake_http):
    ids = [f"Q{i}" for i in range(1, 402)]
    wdqs.fetch_typed(ids, groups=("facts",))
    assert len(fake_http.calls) == 2  # 2 batches x the facts query only
    assert "wd:Q400" in fake_http.calls[0]["data"]["query"]
    assert "wd:Q401" not in fake_http.calls[0]["data"]["query"]
    assert "timeValue" not in fake_http.calls[0]["data"]["query"]
    fake_http.calls.clear()
    wdqs.fetch_typed(ids, groups=("dates", "positions"))
    assert len(fake_http.calls) == 4  # 2 batches x dates, then positions
    names = [call["data"]["query"].split("# royaltree wdqs ", 1)[1].split("\n", 1)[0]
             for call in fake_http.calls]
    assert names == ["dates", "positions", "dates", "positions"]
    assert "wikibase:timeValue" in fake_http.calls[0]["data"]["query"]
    assert "pqv:P582" in fake_http.calls[1]["data"]["query"]
    assert "wd:Q401" not in fake_http.calls[0]["data"]["query"]
    assert "wd:Q401" in fake_http.calls[2]["data"]["query"]


def test_merge_enrichment_keeps_facts_ties_and_open_positions():
    base = {
        "id": "Q1", "revision": 3,
        "father": {"rank": "preferred", "value": {"id": "Q2"}},
        "child": [{"rank": "normal", "id": "Q3"}],
        "date of birth": {"rank": "normal", "value": {"time": "+1000-01-01T00:00:00Z", "precision": 9}},
    }
    extra = {
        "id": "Q1", "revision": 4,
        "date of death": {"rank": "normal", "tie": True, "values": [
            {"time": "+1125-01-01T00:00:00Z", "precision": 9},
            {"time": "+1200-01-01T00:00:00Z", "precision": 7},
        ]},
        "position held": [{"rank": "preferred", "id": "Q9134365",
                           "start": {"time": "2022-09-08T00:00:00Z", "precision": 11}}],
    }
    merged = wdqs.merge_enrichment(base, extra)
    assert merged["father"]["value"]["id"] == "Q2"
    assert merged["child"][0]["id"] == "Q3"
    assert merged["date of death"]["tie"] is True and "value" not in merged["date of death"]
    assert "date of birth" not in merged
    assert "end" not in merged["position held"][0]
    assert merged["position held"][0]["start"]["time"].startswith("2022")
    assert merged["revision"] == 4


def test_client_parses_a_posted_result(fake_http, pinned):
    empty = {"head": {"vars": []}, "results": {"bindings": []}}
    fake_http.script = [
        FakeResponse(payload=pinned["results"]),
        FakeResponse(payload=empty),
        FakeResponse(payload=empty),
        FakeResponse(payload=empty),
    ]
    got = wdqs.fetch_typed(list(pinned["expect"]), retries=1)
    assert wdqs.assess(got, pinned["expect"]) == []


def test_post_backs_off_on_429(fake_http, monkeypatch):
    waits = []
    monkeypatch.setattr(http, "_sleep", waits.append)
    payload = {"head": {"vars": []}, "results": {"bindings": []}}
    fake_http.script = [
        FakeResponse(429, headers={"Retry-After": "3"}),
        FakeResponse(payload=payload),
    ]
    assert wdqs.query("SELECT ?x WHERE { }", retries=2) == payload
    assert waits == [3.0]
    assert http.STATS.as_dict()["429s"] == 1


def test_offline_fetch_makes_no_request(fake_http):
    http.configure(offline=True)
    with pytest.raises(http.NetworkDisabled):
        wdqs.fetch_typed(["Q1"])
    assert fake_http.calls == []


def test_labels_prefer_wdqs_and_fall_back_to_wbgetentities(fake_http):
    fake_http.script = [FakeResponse(payload={
        "head": {"vars": []},
        "results": {"bindings": [{
            "item": uri(WD + "Q1"),
            "itemLabel": lit("Anne"),
            "itemDescription": lit("queen"),
        }]},
    })]
    assert wdqs.fetch_labels(["Q1"], retries=1) == {"Q1": {"label": "Anne", "description": "queen"}}
    assert [call["method"] for call in fake_http.calls] == ["post"]

    fake_http.calls.clear()
    fake_http.script = [
        FakeResponse(503),
        FakeResponse(payload={"entities": {"Q1": {
            "id": "Q1",
            "labels": {"en": {"value": "Anne"}},
            "descriptions": {"en": {"value": "queen"}},
        }}}),
    ]
    assert wdqs.fetch_labels(["Q1"], retries=1)["Q1"]["label"] == "Anne"
    assert [call["method"] for call in fake_http.calls] == ["post", "get"]
    assert "wbgetentities" in (fake_http.calls[1]["params"] or {}).get("action", "")


def test_labels_offline_does_not_fall_back(fake_http):
    http.configure(offline=True)
    with pytest.raises(http.NetworkDisabled):
        wdqs.fetch_labels(["Q1"])
    assert fake_http.calls == []


def test_missing_label_service_qid_is_not_a_label(fake_http):
    fake_http.script = [FakeResponse(payload={
        "head": {"vars": []},
        "results": {"bindings": [{
            "item": uri(WD + "Q1"),
            "itemLabel": lit("Q1"),
        }]},
    })]
    assert wdqs.fetch_labels(["Q1"], retries=1) == {"Q1": {"label": None, "description": None}}


def test_assess_expects_an_explicit_death_tie():
    tied = {"id": "Q215224", "date of death": {
        "rank": "normal", "tie": True,
        "values": [
            {"time": "1200-01-01T00:00:00Z", "precision": 7},
            {"time": "1125-01-01T00:00:00Z", "precision": 9},
        ],
    }}
    expect = {"Q215224": {"death_tie": [
        {"time": "1125-01-01T00:00:00Z", "precision": 9},
        {"time": "1200-01-01T00:00:00Z", "precision": 7},
    ]}}
    assert wdqs.assess({"Q215224": tied}, expect) == []
    picked = {"id": "Q215224", "date of death": {
        "rank": "normal", "value": {"time": "1125-01-01T00:00:00Z", "precision": 9},
    }}
    assert wdqs.assess({"Q215224": picked}, expect)


def test_merge_person_keeps_a_date_tie_and_drops_a_parent_tie():
    typed = {"id": "Q1", "father": {
        "rank": "normal", "tie": True, "values": [{"id": "Q2"}, {"id": "Q3"}],
    }, "date of death": {
        "rank": "normal", "tie": True, "values": [
            {"time": "1125-01-01T00:00:00Z", "precision": 9},
            {"time": "1200-01-01T00:00:00Z", "precision": 7},
        ],
    }}
    legacy = {"id": "Q1", "father": "Q2", "date of death": "+1125-00-00T00:00:00Z",
              "child": ["Q4"], "label": "Someone"}
    merged = wdqs.merge_person(typed, legacy)
    assert "father" not in merged
    assert merged["date of death"]["tie"] is True and "value" not in merged["date of death"]
    assert merged["child"] == ["Q4"] and merged["label"] == "Someone"
    single = {"id": "Q1", "father": {"rank": "preferred", "value": {"id": "Q9"}}}
    assert wdqs.merge_person(single, legacy)["father"] == "Q9"


def test_parse_inverse_links_both_directions_and_skips_self():
    result = sparql([
        {"item": uri(WD + "Q1"), "other": uri(WD + "Q2"), "pid": lit("P40")},
        {"item": uri(WD + "Q1"), "other": uri(WD + "Q3"), "pid": lit("P22")},
        {"item": uri(WD + "Q1"), "other": uri(WD + "Q1"), "pid": lit("P25")},
        {"item": uri(WD + "Q9"), "other": uri(WD + "Q2"), "pid": lit("P40")},
    ])
    assert wdqs.parse_inverse(result, ["Q1"]) == [("Q1", "Q2", "P40"), ("Q1", "Q3", "P22")]


def test_store_source_and_kind_are_wdqs(tmp_path):
    record = {"id": "Q1", "revision": 9, "mother": {"rank": "preferred", "value": {"id": "Q2"}}}
    with Store(str(tmp_path)) as store:
        wdqs.store_typed(store, {"Q1": record, "Q2": {"id": "Q2"}})
        assert store.get("wdqs", ["Q1"])["Q1"]["mother"]["value"]["id"] == "Q2"
        assert store.get("person", ["Q1"]) == {}
        assert store.info("wdqs", ["Q1"])["Q1"][0] == 9
        assert store.info("wdqs", ["Q2"])["Q2"][0] is None
        source = store.conn.execute("SELECT source FROM entities WHERE qid='Q1'").fetchone()[0]
        assert source == "wdqs"
