"""Characterization tests for convertIbtracsToJson.py.

The converter runs in a subprocess. pytest-socket blocks this process's
sockets, and the locked test environment does not install netCDF4, numpy or
geopy (those stay on the README's uv run --with lines). The subprocess is
offline and uses wheels already in the uv cache.

The fixture and the source extract are built by maintain_ibtracs_fixture.py.
That script is maintainer-only and does not run here.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import subprocess
from pathlib import Path

import pytest

# Injected calendar year for the year-cap test. Not date.today().year, so the
# assertion stays the same after 2026.
INJECTED_YEAR = 2026

HURRICANE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = HURRICANE_DIR / "data"
FIXTURE_NC = Path(__file__).resolve().parent / "fixtures" / "ibtracs_few_storms.nc"
SOURCE_JSON = Path(__file__).resolve().parent / "fixtures" / "ibtracs_few_storms.json"

NATURE_TO_STATUS = {"TS": "TS", "ET": "EX", "SS": "SS", "DS": "DB", "NR": "", "MX": ""}
QUADRANTS = ("ne", "se", "sw", "nw")
STORM_FIELDS = {
    "name",
    "basin",
    "number",
    "season",
    "id",
    "max_wind",
    "status_list",
    "record_type_list",
    "track_points",
}
POINT_FIELDS = {
    "id",
    "year",
    "month",
    "hours",
    "minutes",
    "date_time",
    "status",
    "record_type",
    "latitude",
    "longitude",
    "wind",
}

_RUNNER = """
import sys
sys.path.insert(0, sys.argv[1])
import convertIbtracsToJson as conv
conv.main(sys.argv[2], sys.argv[3])
"""


def run_converter(nc_path: Path, out_path: Path) -> None:
    command = [
        "uv",
        "run",
        "--offline",
        "--no-project",
        "--python",
        "3.14",
        "--with",
        "netCDF4==1.7.5.1.post1",
        "--with",
        "numpy==2.5.5",
        "--with",
        "geopy==2.5.0",
        "python",
        "-c",
        _RUNNER,
        str(DATA_DIR),
        str(nc_path),
        str(out_path),
    ]
    result = subprocess.run(command, cwd=DATA_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(
            "convertIbtracsToJson subprocess failed\n" + result.stdout + result.stderr
        )


def zero_gzip_mtime(blob: bytes) -> bytes:
    """Drop the 4-byte gzip mtime. It sits at offset 4, before any filename."""
    assert blob[:2] == b"\x1f\x8b"
    return blob[:4] + b"\x00\x00\x00\x00" + blob[8:]


def expected_status(point: dict) -> str:
    status = point["usa_status"] or ""
    if status:
        return status
    return NATURE_TO_STATUS.get(point["nature"], "")


def wind_when_reported(point: dict):
    """USA wind, else WMO, else nothing to assert (the missing-wind bug)."""
    wind = point["usa_wind"]
    if wind is None:
        wind = point["wmo_wind"]
    if wind is None:
        return None
    return int(wind) if wind > 0 else 0


def pressure_when_reported(point: dict):
    pressure = point["usa_pres"]
    if pressure is None:
        pressure = point["wmo_pres"]
    if pressure is None or pressure <= 0:
        return None
    return int(pressure)


def stable_record(point: dict):
    """Record type for points the landfall bug does not touch.

    Returns None for an already-inland landfall==0 point. Those are the
    over-marking xfail, not part of the value check.
    """
    record = point["usa_record"] or ""
    if record:
        return record
    distance = point["dist2land"]
    if point["landfall"] == 0 and distance == 0:
        return None
    if point["landfall"] == 0 and distance is not None and distance > 0:
        return "L"
    return ""


def desired_record(point: dict) -> str:
    """Coastline crossing only: usa_record, or landfall==0 while still offshore."""
    record = point["usa_record"] or ""
    if record:
        return record
    distance = point["dist2land"]
    if point["landfall"] == 0 and distance is not None and distance > 0:
        return "L"
    return ""


def radii_present(values) -> bool:
    return bool(values) and any(value is not None and value > 0 for value in values)


@pytest.fixture(scope="module")
def source():
    return json.loads(SOURCE_JSON.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def converted(tmp_path_factory):
    out_path = tmp_path_factory.mktemp("ibtracs") / "storms.json.gz"
    run_converter(FIXTURE_NC, out_path)
    with gzip.open(out_path, "rb") as handle:
        return json.loads(handle.read().decode("utf-8"))


def test_fixture_is_the_checked_in_subset(source):
    size = FIXTURE_NC.stat().st_size
    assert size < 1_000_000
    assert size == source["fixture_bytes"]
    assert hashlib.sha256(FIXTURE_NC.read_bytes()).hexdigest() == source["fixture_sha256"]
    assert [storm["sid"] for storm in source["storms"]] == [
        "2009011S16139",
        "1975289N13129",
        "2026021S26041",
    ]


def test_output_schema_and_values(converted, source):
    assert list(converted) == [storm["sid"] for storm in source["storms"]]
    for storm_source in source["storms"]:
        storm = converted[storm_source["sid"]]
        assert STORM_FIELDS <= set(storm)
        assert storm["id"] == storm_source["sid"]
        assert storm["name"] == storm_source["name"]
        assert storm["season"] == storm_source["season"]
        assert storm["number"] == storm_source["number"]
        basin = next((point["basin"] for point in storm_source["points"] if point["basin"]), "")
        atcf = next((point["atcf_id"] for point in storm_source["points"] if point["atcf_id"]), "")
        assert storm["basin"] == basin
        if atcf:
            assert storm["atcf_id"] == atcf
        else:
            assert "atcf_id" not in storm

        statuses = set()
        records = set()
        reported_winds = []
        pressures = []
        assert len(storm["track_points"]) == len(storm_source["points"])
        for point_source, point in zip(storm_source["points"], storm["track_points"]):
            assert POINT_FIELDS <= set(point)
            assert point["id"] == storm_source["sid"]
            assert point["date_time"] == point_source["iso"]
            date, clock = point_source["iso"].split(" ")
            year, month, _day = (int(part) for part in date.split("-"))
            assert point["year"] == year
            assert point["month"] == month
            assert point["hours"] == int(clock[0:2])
            assert point["minutes"] == int(clock[3:5])
            assert point["latitude"] == round(point_source["lat"], 2)
            assert point["longitude"] == round(point_source["lon"], 2)

            status = expected_status(point_source)
            assert point["status"] == status
            if status:
                statuses.add(status)

            wind = wind_when_reported(point_source)
            if wind is not None:
                assert point["wind"] == wind
                reported_winds.append(wind)
            pressure = pressure_when_reported(point_source)
            if pressure is None:
                assert "pressure" not in point
            else:
                assert point["pressure"] == pressure
                pressures.append(pressure)
            record = stable_record(point_source)
            if record is not None:
                assert point["record_type"] == record
                if record:
                    records.add(record)

            rmw = point_source["rmw"]
            if rmw is not None and rmw > 0:
                assert point["max_wind_radius"] == int(rmw)
                ring = point["max_wind_poly"]
                assert len(ring) == 5 and ring[0] == ring[-1]
                assert ring[0][1] > point["latitude"]
                assert ring[1][0] > point["longitude"]
                assert ring[2][1] < point["latitude"]
                assert ring[3][0] < point["longitude"]
            else:
                assert "max_wind_poly" not in point
                assert "max_wind_radius" not in point

            for threshold, values in (
                ("34", point_source["r34"]),
                ("50", point_source["r50"]),
                ("64", point_source["r64"]),
            ):
                for index, quadrant in enumerate(QUADRANTS):
                    key = f"{threshold}_{quadrant}_poly"
                    if radii_present(values) and values[index] is not None and values[index] > 0:
                        poly = point[key]
                        center = [point["longitude"], point["latitude"]]
                        assert len(poly) == 5 and poly[0] == center and poly[-1] == center
                    else:
                        assert key not in point

        assert storm["status_list"] == sorted(statuses)
        assert storm["record_type_list"] == sorted(records)
        if reported_winds:
            assert storm["max_wind"] == max(reported_winds)
        if pressures:
            assert storm["min_pressure"] == min(pressures)
        else:
            assert "min_pressure" not in storm


def test_gzip_is_deterministic(tmp_path):
    # gzip.open stores the basename. Same name, two directories: only mtime moves.
    first = tmp_path / "one" / "storms.json.gz"
    second = tmp_path / "two" / "storms.json.gz"
    first.parent.mkdir()
    second.parent.mkdir()
    run_converter(FIXTURE_NC, first)
    run_converter(FIXTURE_NC, second)
    first_bytes = first.read_bytes()
    second_bytes = second.read_bytes()
    assert gzip.decompress(first_bytes) == gzip.decompress(second_bytes)
    assert zero_gzip_mtime(first_bytes) == zero_gzip_mtime(second_bytes)
    # The compressed body and the rest of the header match. Only mtime moves.
    assert first_bytes[:4] == second_bytes[:4]
    assert first_bytes[8:] == second_bytes[8:]


@pytest.mark.xfail(
    reason="website-prop-pipeline-hurricane-track-semantics",
    strict=True,
    raises=AssertionError,
)
def test_landfall_is_not_marked_for_points_already_over_land(converted, source):
    """record_type L only for a real coastline crossing.

    landfall==0 on a point that is already inland (dist2land==0) is not a crossing.
    """
    mismatches = []
    for storm_source in source["storms"]:
        storm = converted[storm_source["sid"]]
        for point_source, point in zip(storm_source["points"], storm["track_points"]):
            want = desired_record(point_source)
            if point["record_type"] != want:
                mismatches.append(
                    f"{storm_source['sid']} {point_source['iso']}: "
                    f"{point['record_type']!r} should be {want!r} "
                    f"(landfall={point_source['landfall']}, dist2land={point_source['dist2land']})"
                )
    assert not mismatches


@pytest.mark.xfail(
    reason="website-prop-pipeline-hurricane-track-semantics",
    strict=True,
    raises=AssertionError,
)
def test_spur_tracks_are_flagged_or_excluded(converted, source):
    """A spur is left out of the main set, or it carries a track_type flag."""
    for storm_source in source["storms"]:
        if "spur" not in storm_source["track_type"].lower():
            continue
        storm = converted.get(storm_source["sid"])
        if storm is None:
            continue
        track_type = str(storm.get("track_type", ""))
        assert "spur" in track_type.lower()


@pytest.mark.xfail(
    reason="website-prop-pipeline-hurricane-track-semantics",
    strict=True,
    raises=AssertionError,
)
def test_missing_wind_is_null_not_zero(converted, source):
    """A point with neither USA nor WMO wind is null, not 0."""
    mismatches = []
    for storm_source in source["storms"]:
        storm = converted[storm_source["sid"]]
        for point_source, point in zip(storm_source["points"], storm["track_points"]):
            if point_source["usa_wind"] is None and point_source["wmo_wind"] is None:
                if point["wind"] is not None:
                    mismatches.append(
                        f"{storm_source['sid']} {point_source['iso']}: wind={point['wind']!r}"
                    )
    assert not mismatches


@pytest.mark.xfail(
    reason="website-prop-pipeline-hurricane-data-driven-years",
    strict=True,
    raises=AssertionError,
)
def test_year_cap_is_not_frozen_at_the_injected_calendar_year(converted, source):
    """The season filter follows the dataset, not a frozen calendar year.

    INJECTED_YEAR is fixed in this file. The July 2026 IBTrACS source has no
    season after 2026, so the test does not read the clock to decide the cap.
    """
    seasons = {storm["season"] for storm in source["storms"]}
    assert INJECTED_YEAR in seasons
    assert any(storm["season"] == INJECTED_YEAR for storm in converted.values())
    page = (HURRICANE_DIR / "Hurricane.jsx").read_text(encoding="utf-8")
    panel = (HURRICANE_DIR / "filter-panel.jsx").read_text(encoding="utf-8")
    frozen = []
    if f"maxYear: {INJECTED_YEAR}" in page:
        frozen.append("Hurricane.jsx maxYear")
    if f"max={{{INJECTED_YEAR}}}" in panel:
        frozen.append("filter-panel.jsx max")
    assert not frozen
