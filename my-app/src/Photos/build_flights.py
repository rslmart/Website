#!/usr/bin/env python3
"""Build the flight-paths dataset for the Photos page from a Flighty CSV export.

The Flighty export only has IATA airport codes (From/To), so this resolves each
code to coordinates using the OpenFlights airports database, then writes a compact
flights.json into the same output/ folder as the photos (deployed to
s3://<bucket>/photos and served at makoa.link/photos/flights.json).

Usage
-----
  python3 src/Photos/build_flights.py                 # newest FlightyExport*.csv here
  python3 src/Photos/build_flights.py --input path/to/export.csv

The OpenFlights airports table is fetched once and cached next to this script as
airports.dat (git-ignored). Delete it to refresh.
"""

import argparse
import csv
import glob
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

OPENFLIGHTS_URL = (
    "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"
)

# Airports missing from the (older) OpenFlights dump, filled in by hand.
MANUAL_AIRPORTS = {
    "BER": {"code": "BER", "name": "Berlin Brandenburg", "city": "Berlin",
            "country": "Germany", "lat": 52.36667, "lng": 13.50333},
}


def load_airports(cache_path):
    """Return {IATA: {code,name,city,country,lat,lng}} from OpenFlights (cached)."""
    if not os.path.isfile(cache_path):
        print(f"Fetching airport database -> {cache_path}")
        urllib.request.urlretrieve(OPENFLIGHTS_URL, cache_path)
    airports = {}
    with open(cache_path, "r", encoding="utf-8") as fh:
        # airports.dat: id,name,city,country,IATA,ICAO,lat,lng,alt,tz,dst,tzdb,type,source
        for row in csv.reader(fh):
            if len(row) < 8:
                continue
            iata = row[4].strip()
            if not iata or iata == "\\N" or len(iata) != 3:
                continue
            try:
                lat, lng = float(row[6]), float(row[7])
            except ValueError:
                continue
            airports[iata] = {
                "code": iata,
                "name": row[1],
                "city": row[2],
                "country": row[3],
                "lat": round(lat, 5),
                "lng": round(lng, 5),
            }
    for code, info in MANUAL_AIRPORTS.items():
        airports.setdefault(code, info)
    return airports


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Build flights.json for the Photos page.")
    parser.add_argument("--input", help="Flighty CSV export (default: newest FlightyExport*.csv here).")
    parser.add_argument("--output", default=os.path.join(here, "output"),
                        help="Output folder (default: ./output next to this script).")
    parser.add_argument("--include-canceled", action="store_true",
                        help="Include flights marked Canceled (skipped by default).")
    args = parser.parse_args()

    input_path = args.input
    if not input_path:
        matches = sorted(glob.glob(os.path.join(here, "FlightyExport*.csv")))
        if not matches:
            sys.exit("No FlightyExport*.csv found next to this script; pass --input.")
        input_path = matches[-1]
    if not os.path.isfile(input_path):
        sys.exit(f"Input CSV not found: {input_path}")

    airports_all = load_airports(os.path.join(here, "airports.dat"))
    os.makedirs(args.output, exist_ok=True)

    flights = []
    used_codes = set()
    unresolved = set()
    skipped_canceled = 0

    with open(input_path, "r", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            frm, to = row.get("From", "").strip(), row.get("To", "").strip()
            if not frm or not to:
                continue
            if row.get("Canceled", "").strip().lower() == "true" and not args.include_canceled:
                skipped_canceled += 1
                continue
            missing = [c for c in (frm, to) if c not in airports_all]
            if missing:
                unresolved.update(missing)
                continue
            used_codes.add(frm)
            used_codes.add(to)
            flights.append({
                "date": row.get("Date", "").strip(),
                "airline": row.get("Airline", "").strip(),
                "flight": row.get("Flight", "").strip(),
                "from": frm,
                "to": to,
                "aircraft": row.get("Aircraft Type Name", "").strip(),
            })

    flights.sort(key=lambda f: f["date"])
    airports = {code: airports_all[code] for code in sorted(used_codes)}

    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "count": len(flights),
        "unresolved": sorted(unresolved),
        "airports": airports,
        "flights": flights,
    }
    out_path = os.path.join(args.output, "flights.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(",", ":"))

    print("\n--- summary ---")
    print(f"  flights:    {len(flights)}")
    print(f"  airports:   {len(airports)}")
    print(f"  canceled skipped: {skipped_canceled}")
    if unresolved:
        print(f"  UNRESOLVED codes (no coords, flights dropped): {sorted(unresolved)}")
    print(f"  manifest:   {out_path}")


if __name__ == "__main__":
    main()
