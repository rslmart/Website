"""Known issues in today's public/royalty/ payloads that `validate.py check` allows.

Every entry names a rule, why the issue is tolerated for now, the chain step
expected to fix it, and the exact subjects (as `validate.py check` reports
them). Anything not listed fails the check. Entries that no longer occur are
reported as stale and should be removed.

Rules with many subjects ("bulk") keep their subjects in check_allowlist.json,
which `validate.py check --update-allowlist` rewrites from the current output.
Review that file's diff like code: it must only shrink unless a step explains
why new subjects are acceptable. Small rules list their subjects inline here and
are edited by hand.

Baseline: master 4d0915c (41 trees, 119 houses), 2026-11-17.
"""
import json
import os

_BULK_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check_allowlist.json")

ALLOWLIST = {
    # --- Wikidata data errors (source data, not pipeline bugs) ---------------
    "father-is-mother": {
        "reason": "Wikidata lists the same item as father and mother. Fix on "
                  "Wikidata; -wdqs-fetch should flag rather than copy these.",
        "subjects": {
            "Q1230482",    # both Q1528
            "Q24883338",   # both Q24239614
            "Q3495067",    # both Q103560123 (seen again in the 2026-11-17 rebuild)
            "Q96238919",   # both Q96238920
        },
    },
    # --- Pipeline bugs (fixed later in the chain) ----------------------------
    "node-id-mismatch": {
        "reason": "Merged (redirected) Wikidata items: the cache key is the old "
                  "QID, the record is the redirect target, so one person can "
                  "appear twice. Fix in -wdqs-fetch (resolve redirects).",
        "subjects": {
            "Q11067934",   # holds Q6759744
            # Q100436124, Q19959139, Q55114348 and Q61889411 no longer mismatch
            # after the 2026-11-17 rebuild: each redirect target is the published record.
        },
    },
    "schema-person": {
        "reason": "null inside a labelled list: the referenced item had no "
                  "English label (or, for 'unmarried partner', the known "
                  "label-before-combine bug, now in royaltree/build.py combine). Fix in "
                  "-wdqs-fetch.",
        "subjects": {
            "Q10290543:occupation",
            "Q1613177:educated at",
            "Q1799886:occupation",
            "Q18763:occupation",
            "Q19244:occupation",
            "Q2889821:occupation",
            "Q3108524:occupation",
            "Q12860:unmarried partner",  # null in the list; same label bug as Q361000
            "Q361000:unmarried partner",
            "Q379792:languages spoken, written or signed",
            "Q72686:occupation",
            "Q827937:occupation",
        },
    },
    # --- Bulk rules (subjects in check_allowlist.json) -----------------------
    "monarch-missing": {
        "bulk": True,
        "reason": "Monarch-list entries with no succession path (the BFS found "
                  "no family link to the previous monarch), so they are not in "
                  "`nodes` and the frontend skips them. Worst: Scotland 27, "
                  "Byzantine 17, Chinggisids 17. Fix in -monarch-registry / "
                  "-wdqs-fetch.",
    },
    "empty-succession-path": {
        "bulk": True,
        "reason": "Empty paths in successionList, by index (same cause as "
                  "monarch-missing). Fix in -monarch-registry / -wdqs-fetch.",
    },
    "born-after-death": {
        "bulk": True,
        "reason": "Payload dates carry no precision, so a century- or "
                  "decade-precision birth (e.g. +1000-01-01) can sort after an "
                  "exact death. Some are real Wikidata errors. -wdqs-fetch "
                  "adds {time, precision}; re-baseline then.",
    },
    "parent-not-older": {
        "bulk": True,
        "reason": "Parent's birth is not before the child's, mostly for the "
                  "same precision reason as born-after-death (231 are the same "
                  "year). Re-baseline after -wdqs-fetch.",
    },
}


def _load_bulk():
    try:
        with open(_BULK_PATH) as f:
            bulk = json.load(f)
    except FileNotFoundError:
        bulk = {}
    for rule, entry in ALLOWLIST.items():
        if entry.get("bulk"):
            entry["subjects"] = set(bulk.get(rule, []))


def write_bulk(subjects_by_rule):
    """Rewrite check_allowlist.json with the given subjects for the bulk rules."""
    out = {rule: sorted(subjects_by_rule.get(rule, ()))
           for rule, entry in sorted(ALLOWLIST.items()) if entry.get("bulk")}
    with open(_BULK_PATH, "w") as f:
        json.dump(out, f, indent=0)
        f.write("\n")
    _load_bulk()


_load_bulk()
