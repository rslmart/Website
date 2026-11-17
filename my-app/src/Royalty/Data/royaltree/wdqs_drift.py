"""Compare the pinned WDQS cases with one live fetch.

A mismatch is drift from a later Wikidata edit, not a test failure. The script
prints the differences and exits 0. It exits 1 only when the query service does
not answer. Each query is tried twice so one 429 can clear, then it stops.

Run from my-app/src/Royalty/Data:

    uv run python -m royaltree.wdqs_drift
"""
import json
import sys
from pathlib import Path

from royaltree import http
from royaltree.wdqs import assess, fetch_typed

PINNED = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "wdqs_pinned.json"


def main():
    pinned = json.loads(PINNED.read_text())
    qids = list(pinned["expect"])
    try:
        records = fetch_typed(qids, retries=2, timeout=(10, 50))
    except (http.FetchError, http.NetworkDisabled) as exc:
        print(f"wdqs drift: query failed ({exc})", file=sys.stderr)
        return 1
    drifts = assess(records, pinned["expect"])
    if not drifts:
        print(f"wdqs drift: no drift for {len(qids)} people (pinned {pinned['checked']})")
        return 0
    print(f"wdqs drift: {len(drifts)} difference(s) since {pinned['checked']}")
    for line in drifts:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
