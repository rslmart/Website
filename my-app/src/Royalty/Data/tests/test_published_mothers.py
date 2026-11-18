"""Four published mothers, read from the committed gzip files.

Offline. Every copy in nodes and extendedNodes is checked, including the
house files that repeat one person. A new file fails the test.
"""
import json

import validate

# file -> sections that already contained the person.
WHERE = {
    "Q462856": {"England.json.gz": {"nodes"}},
    "Q272326": {
        "Babenberg.json.gz": {"nodes"},
        "Bavaria.json.gz": {"extendedNodes"},
        "Carolingian_dynasty.json.gz": {"nodes"},
        "England.json.gz": {"nodes", "extendedNodes"},
        "France.json.gz": {"extendedNodes"},
        "House_of_Blois.json.gz": {"nodes"},
        "House_of_Flanders.json.gz": {"nodes"},
        "House_of_Holland.json.gz": {"nodes"},
        "House_of_Welf.json.gz": {"nodes"},
        "House_of_Wessex.json.gz": {"nodes"},
        "Ottonian_dynasty.json.gz": {"nodes"},
    },
    "Q259077": {
        "England.json.gz": {"nodes", "extendedNodes"},
        "House_of_Neville.json.gz": {"nodes"},
        "House_of_Stuart.json.gz": {"nodes"},
        "House_of_York.json.gz": {"nodes"},
        "Scotland.json.gz": {"extendedNodes"},
    },
    "Q2634369": {
        "Babenberg.json.gz": {"nodes"},
        "Denmark.json.gz": {"extendedNodes"},
        "England.json.gz": {"nodes", "extendedNodes"},
        "House_of_Ascania_in_Brandenburg.json.gz": {"nodes"},
        "House_of_Barcelona.json.gz": {"nodes"},
        "House_of_Bjelbo.json.gz": {"nodes"},
        "House_of_Estridsen.json.gz": {"nodes"},
        "House_of_Griffins.json.gz": {"nodes"},
        "House_of_Mecklenburg.json.gz": {"nodes"},
        "House_of_Welf.json.gz": {"nodes"},
        "House_of_Wettin.json.gz": {"nodes"},
        "House_of_Wittelsbach.json.gz": {"nodes"},
        "Hungary.json.gz": {"extendedNodes"},
        "Norway.json.gz": {"extendedNodes"},
        "P_emyslid_dynasty.json.gz": {"nodes"},
        "Piast_dynasty.json.gz": {"nodes"},
        "Royal_house_of_Aragon.json.gz": {"nodes"},
        "Rurik_dynasty.json.gz": {"nodes"},
        "Russia.json.gz": {"extendedNodes"},
        "Scotland.json.gz": {"extendedNodes"},
        "Silesian_Piasts.json.gz": {"nodes"},
        "Sweden.json.gz": {"extendedNodes"},
        "rp_d_dynasty.json.gz": {"nodes"},
    },
}

# A QID string is the mother. None means the key is absent.
MOTHER = {
    "Q462856": "Q96088549",
    "Q272326": "Q96074775",
    "Q259077": None,
    "Q2634369": None,
}


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


def test_published_mothers_match_best_rank():
    files = validate.load_dir(validate.PUBLIC_DIR)
    copies = {qid: _copies(files, qid) for qid in WHERE}
    for qid, where in WHERE.items():
        assert copies[qid].keys() == where.keys()
        for name, sections in where.items():
            assert copies[qid][name].keys() == sections

    expected_counts = {"Q462856": 1, "Q272326": 12, "Q259077": 6, "Q2634369": 24}
    for qid, mother in MOTHER.items():
        people = [person for sections in copies[qid].values() for person in sections.values()]
        assert len(people) == expected_counts[qid]
        _same(people)
        if mother is None:
            assert "mother" not in people[0]
        else:
            assert people[0]["mother"] == mother
