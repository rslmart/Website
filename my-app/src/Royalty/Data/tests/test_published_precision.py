"""The four published precision rows, read from the committed gzip files.

Offline. No network and no store. Every copy in nodes and extendedNodes is
checked, including the house files that repeat one person.
"""
import json

import validate
from royaltree import wdqs

# file -> sections that already contained the person. A new file fails the test.
WHERE = {
    "Q462856": {"England.json.gz": {"nodes"}},
    "Q3495067": {
        "Anscarids.json.gz": {"nodes"},
        "Burgundy_family.json.gz": {"nodes"},
        "Capet_family.json.gz": {"nodes"},
        "Capetian_House_of_Anjou.json.gz": {"nodes"},
        "Capetian_dynasty.json.gz": {"nodes"},
        "England.json.gz": {"nodes", "extendedNodes"},
        "House_of_Anjou.json.gz": {"nodes"},
        "House_of_Ascania_in_Brandenburg.json.gz": {"nodes"},
        "House_of_Blois.json.gz": {"nodes"},
        "House_of_Burgundy_Castile_and_Le_n.json.gz": {"nodes"},
        "House_of_Burgundy_Portugal.json.gz": {"nodes"},
        "House_of_Dunkeld.json.gz": {"nodes"},
        "House_of_Flanders.json.gz": {"nodes"},
        "House_of_Hohenstaufen.json.gz": {"nodes"},
        "House_of_Holland.json.gz": {"nodes"},
        "House_of_Lorraine.json.gz": {"nodes"},
        "House_of_Normandy.json.gz": {"nodes"},
        "House_of_Plantagenet.json.gz": {"nodes"},
        "House_of_Stuart.json.gz": {"nodes"},
        "House_of_Welf.json.gz": {"nodes"},
        "House_of_Wessex.json.gz": {"nodes"},
        "Scotland.json.gz": {"extendedNodes"},
    },
    "Q43274": {"England.json.gz": {"nodes", "extendedNodes"}},
    "Q45068": {
        "House_of_Bernadotte.json.gz": {"nodes"},
        "Sweden.json.gz": {"nodes", "extendedNodes"},
    },
}

CHARLES_CLOSED = [
    {"end cause": "House of Lords Act 1999", "end time": "+1999-11-11T00:00:00Z",
     "id": "Q18952564", "label": "member of the House of Lords"},
    {"end cause": "succession to a peerage", "end time": "+2021-04-09T00:00:00Z",
     "id": "Q2762318", "label": "heir apparent", "of": "Duke of Edinburgh",
     "start time": "+1948-11-14T00:00:00Z"},
    {"end time": "+2022-09-08T00:00:00Z", "from": ["Q590227"], "id": "Q180729",
     "label": "Prince of Wales", "start time": "+1958-07-26T00:00:00Z", "to": ["Q36812"]},
    {"end cause": "accession of Charles III", "end time": "+2022-09-08T00:00:00Z",
     "id": "Q113879628", "label": "Heir Apparent of the United Kingdom",
     "start time": "+1952-00-00T00:00:00Z"},
]
CARL_CLOSED = [
    {"end time": "+1973-09-15T00:00:00Z", "from": ["Q52878"], "id": "Q207293",
     "label": "crown prince", "start time": "+1950-10-29T00:00:00Z"},
]


def _copies(files, qid):
    found = {}
    for name, payload in files.items():
        if not isinstance(payload, dict):
            continue
        for section in ("nodes", "extendedNodes"):
            person = (payload.get(section) or {}).get(qid)
            if person is not None:
                found.setdefault(name, {})[section] = person
    return found


def _same(people):
    blobs = {json.dumps(person, sort_keys=True) for person in people}
    assert len(blobs) == 1


def test_published_precision_rows_match_wikidata():
    files = validate.load_dir(validate.PUBLIC_DIR)
    copies = {qid: _copies(files, qid) for qid in WHERE}
    for qid, where in WHERE.items():
        assert copies[qid].keys() == where.keys()
        for name, sections in where.items():
            assert copies[qid][name].keys() == sections

    ealdgyth = [person for sections in copies["Q462856"].values() for person in sections.values()]
    _same(ealdgyth)
    birth, death = ealdgyth[0]["date of birth"], ealdgyth[0]["date of death"]
    assert birth == {"time": "+1100-01-01T00:00:00Z", "precision": 7}
    assert death == {"time": "+1100-01-01T00:00:00Z", "precision": 7}
    assert wdqs.format_date(birth) == "c. 12th century"
    assert wdqs.format_date(death) == "c. 12th century"
    assert "position held" not in ealdgyth[0]
    assert ealdgyth[0]["father"] == "Q271362" and ealdgyth[0]["mother"] == "Q96088549"

    older = [person for sections in copies["Q3495067"].values() for person in sections.values()]
    _same(older)
    assert len(older) == 23
    birth = older[0]["date of birth"]
    assert birth == {"time": "+0990-01-01T00:00:00Z", "precision": 8}
    assert wdqs.format_date(birth) == "990s"
    assert "date of death" not in older[0]
    assert "position held" not in older[0]
    assert older[0]["father"] == older[0]["mother"] == "Q103560123"

    charles = [person for sections in copies["Q43274"].values() for person in sections.values()]
    _same(charles)
    assert charles[0]["date of birth"] == {"time": "+1948-11-14T00:00:00Z", "precision": 11}
    assert "date of death" not in charles[0]
    assert charles[0]["father"] == "Q80976" and charles[0]["mother"] == "Q9682"
    assert charles[0]["image"] == ["King Charles III (July 2023).jpg"]
    uk = {"id": "Q9134365", "start time": "+2022-09-08T00:00:00Z",
          "label": "monarch of the United Kingdom"}
    assert charles[0]["position held"] == CHARLES_CLOSED + [uk]
    assert "end time" not in uk

    carl = [person for sections in copies["Q45068"].values() for person in sections.values()]
    _same(carl)
    assert carl[0]["date of birth"] == {"time": "+1946-04-30T00:00:00Z", "precision": 11}
    assert "date of death" not in carl[0]
    assert carl[0]["father"] == "Q347374" and carl[0]["mother"] == "Q57626"
    assert carl[0]["image"][0] == "Crafoord Prize D81 9141 (42282165922) (cropped).jpg"
    sweden = {"id": "Q1268572", "start time": "+1973-09-15T00:00:00Z",
              "label": "Monarch of Sweden"}
    assert carl[0]["position held"] == CARL_CLOSED + [sweden]
    assert "end time" not in sweden
