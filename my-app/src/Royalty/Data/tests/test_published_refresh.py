"""Published parents, dates and offices after the typed WDQS refresh.

Offline. The merge tests build typed records in memory. The file test reads
the committed gzip payloads and the succession-link snapshot taken before
those payloads were rewritten.
"""
import gzip
import json
from pathlib import Path

import validate
from royaltree import wdqs

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "succession_links.json.gz"

# A QID is the mother. None means the key is absent on every copy.
PINS = {
    "Q462856": "Q96088549",
    "Q272326": "Q96074775",
    "Q259077": None,
    "Q2634369": None,
}


def _parent(qid, rank="preferred"):
    return {"rank": rank, "value": {"id": qid}}


def _when(time, precision=11):
    return {"time": time, "precision": precision}


def _office(qid, start=None, end=None):
    item = {"rank": "normal", "id": qid}
    if start is not None:
        item["start"] = _when(start)
    if end is not None:
        item["end"] = _when(end)
    return item


def _person():
    return {
        "id": "Q1",
        "label": "Someone",
        "description": None,
        "mother": "Qold",
        "father": "Qdad",
        "date of birth": "+1000-00-00T00:00:00Z",
        "image": ["portrait.jpg"],
        "noble title": [{"id": "Qtitle", "label": "duke"}],
        "position held": [{
            "id": "Qoffice",
            "label": "king",
            "of": "England",
            "start time": "+1100-00-00T00:00:00Z",
            "end time": "+1130-01-01T00:00:00Z",
            "from": ["Qprev"],
            "to": ["Qnext"],
            "end cause": "death in office",
        }],
    }


def test_apply_published_sets_one_parent_and_keeps_a_tie():
    person = _person()
    typed = {
        "id": "Q1",
        "mother": _parent("Q96088549"),
        "father": {"rank": "normal", "tie": True, "values": [{"id": "Q11"}, {"id": "Q12"}]},
    }
    wdqs.apply_published(person, typed)
    assert person["mother"] == "Q96088549"
    assert person["father"] == "Qdad"
    assert person["image"] == ["portrait.jpg"]
    assert person["noble title"][0]["label"] == "duke"
    assert person["date of birth"] == "+1000-00-00T00:00:00Z"


def test_apply_published_removes_a_parent_the_fetch_does_not_return():
    person = _person()
    wdqs.apply_published(person, {"id": "Q1", "father": _parent("Q20")})
    assert "mother" not in person
    assert person["father"] == "Q20"


def test_apply_published_stores_a_date_or_a_tie_and_leaves_a_missing_one():
    person = _person()
    person["date of death"] = "+1200-00-00T00:00:00Z"
    typed = {
        "id": "Q1",
        "mother": _parent("Q30"),
        "father": _parent("Q31"),
        "date of birth": {"rank": "normal", "value": {"time": "1100-01-01T00:00:00Z", "precision": 7}},
        "date of death": {"rank": "normal", "tie": True, "values": [
            {"time": "1125-01-01T00:00:00Z", "precision": 9},
            {"time": "1200-01-01T00:00:00Z", "precision": 7},
        ]},
    }
    wdqs.apply_published(person, typed)
    assert person["date of birth"] == {"time": "+1100-01-01T00:00:00Z", "precision": 7}
    assert person["date of death"]["tie"] is True
    assert person["date of death"]["values"][0]["time"].startswith("+")
    person = _person()
    wdqs.apply_published(person, {
        "id": "Q1",
        "mother": _parent("Q30"),
        "father": _parent("Q31"),
        "date of birth": {"rank": "normal", "unknown": True},
    })
    assert person["date of birth"] == "+1000-00-00T00:00:00Z"


def test_apply_published_merges_offices_without_dropping_links():
    person = _person()
    typed = {
        "id": "Q1",
        "mother": _parent("Q30"),
        "father": _parent("Q31"),
        "position held": [
            _office("Qoffice", start="1100-06-01T00:00:00Z"),
            _office("Qopen", start="2022-09-08T00:00:00Z"),
        ],
    }
    wdqs.apply_published(person, typed)
    kept, added = person["position held"]
    assert kept["id"] == "Qoffice"
    assert kept["start time"] == "+1100-06-01T00:00:00Z"
    assert "end time" not in kept
    assert kept["from"] == ["Qprev"] and kept["to"] == ["Qnext"]
    assert kept["label"] == "king" and kept["end cause"] == "death in office"
    assert kept["of"] == "England"
    assert added == {"id": "Qopen", "start time": "+2022-09-08T00:00:00Z"}
    assert "end time" not in added
    assert "label" not in added


def test_apply_published_keeps_an_office_the_fetch_does_not_mention():
    person = _person()
    typed = {
        "id": "Q1",
        "mother": _parent("Q30"),
        "father": _parent("Q31"),
        "position held": [_office("Qother", start="1200-01-01T00:00:00Z", end="1210-01-01T00:00:00Z")],
    }
    wdqs.apply_published(person, typed)
    assert person["position held"][0]["from"] == ["Qprev"]
    assert person["position held"][0]["start time"] == "+1100-00-00T00:00:00Z"
    assert person["position held"][1]["id"] == "Qother"
    assert person["position held"][1]["end time"] == "+1210-01-01T00:00:00Z"


def test_repeated_office_ids_follow_the_start_year():
    person = _person()
    person["position held"] = [
        {"id": "Qreign", "start time": "+1483-00-00T00:00:00Z", "from": ["Qearly"], "label": "early"},
        {"id": "Qreign", "start time": "+1513-00-00T00:00:00Z", "from": ["Qlate"], "label": "late"},
    ]
    typed = {
        "id": "Q1",
        "mother": _parent("Q30"),
        "father": _parent("Q31"),
        "position held": [
            _office("Qreign", start="1513-01-01T00:00:00Z", end="1517-02-12T00:00:00Z"),
        ],
    }
    wdqs.apply_published(person, typed)
    early, late = person["position held"]
    assert early["from"] == ["Qearly"] and early["start time"] == "+1483-00-00T00:00:00Z"
    assert late["from"] == ["Qlate"] and late["start time"] == "+1513-01-01T00:00:00Z"
    assert late["end time"] == "+1517-02-12T00:00:00Z"
    assert early["label"] == "early" and late["label"] == "late"


def _copies(files, qid):
    found = []
    for payload in files.values():
        if not isinstance(payload, dict):
            continue
        for section in ("nodes", "extendedNodes"):
            person = (payload.get(section) or {}).get(qid)
            if person is not None:
                found.append(person)
    return found


def _same_links(office, expected):
    return office.get("id") == expected["id"] and office.get("from") == expected.get("from") and office.get("to") == expected.get("to")


def test_typed_refresh_keeps_pins_and_succession_links():
    files = validate.load_dir(validate.PUBLIC_DIR)
    for qid, mother in PINS.items():
        copies = _copies(files, qid)
        assert copies
        for person in copies:
            if mother is None:
                assert "mother" not in person
            else:
                assert person["mother"] == mother

    with gzip.open(FIXTURE, "rt", encoding="utf-8") as handle:
        expected = json.load(handle)
    for name, sections in expected.items():
        payload = files[name]
        for section, people in sections.items():
            block = payload[section]
            for qid, offices in people.items():
                held = block[qid].get("position held") or []
                used = set()
                for want in offices:
                    match = next((i for i, office in enumerate(held)
                                  if i not in used and _same_links(office, want)), None)
                    assert match is not None, (name, section, qid, want)
                    used.add(match)
