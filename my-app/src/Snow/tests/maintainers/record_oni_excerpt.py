#!/usr/bin/env python3
"""Record the pinned CPC ONI excerpt. Maintainer-only. Dated 2026-11-17.

Fetches https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt and writes
the header plus the rows in ROWS. The Snow tests read the committed excerpt.
pytest does not collect this file (it is not named test_*.py) and the suite
does not import it.
"""

import urllib.request
from pathlib import Path

SOURCE = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
ROWS = (
    ("DJF", "2000"),
    ("JFM", "2000"),
    ("DJF", "2002"),
    ("DJF", "2010"),
    ("DJF", "2016"),
    ("DJF", "2026"),
    ("ASO", "2026"),
)
OUT = Path(__file__).resolve().parents[1] / "fixtures" / "oni_excerpt.ascii.txt"


def main():
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        lines = response.read().decode("utf-8").splitlines()
    wanted = set(ROWS)
    kept = [lines[0]]
    for line in lines[1:]:
        parts = line.split()
        if len(parts) >= 2 and (parts[0], parts[1]) in wanted:
            kept.append(line)
    found = {(line.split()[0], line.split()[1]) for line in kept[1:]}
    missing = wanted - found
    if missing:
        raise SystemExit(f"missing rows: {sorted(missing)}")
    OUT.write_text("\n".join(kept) + "\n")
    print(f"wrote {OUT} ({len(kept) - 1} rows)")


if __name__ == "__main__":
    main()
