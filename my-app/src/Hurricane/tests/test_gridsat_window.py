"""GridSat frame placement for the four committed tracks and the catalog crop.

Reads public/hurricane/gridsat/frames.json, the JPEGs, and the published
storm file. It does not download GridSat. pytest-socket blocks sockets in
this process. The date-line join and the fill hour run in a subprocess:

    uv run --with netCDF4 --with numpy --with pillow --with matplotlib \
        python buildGridsatWindow.py
"""

from __future__ import annotations

import fcntl
import gzip
import importlib.util
import json
import math
import os
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import pytest

HURRICANE_DIR = Path(__file__).resolve().parents[1]
PUBLIC_HURRICANE = HURRICANE_DIR.parents[1] / "public" / "hurricane"
FRAMES_PATH = PUBLIC_HURRICANE / "gridsat" / "frames.json"
STORMS_PATH = PUBLIC_HURRICANE / "storms.json.gz"
SCRIPT = HURRICANE_DIR / "data" / "buildGridsatWindow.py"

SLICE_DAYS = ("2023-10-20", "1992-09-25")
POLEWARD_NAMES = {"BONNIE", "CHARLEY", "DANIELLE", "TED"}

# EPSG:3857 sphere. One 0.07° latitude cell is about 8 km on this sphere.
R_M = 6378137.0
CELL_DEG = 0.07
STEP_KM = 200.0

# Sandy, Matthew, Hugo, Melissa. Frame counts are the distinct GridSat hours.
SIDS = (
    "2012296N14283",
    "2016273N13300",
    "1989254N13340",
    "2025294N14290",
)

# The original Sandy and Matthew centers, plus one Hugo frame and one Melissa frame.
CENTER_CHECKS = {
    "2012296N14283": {
        "track_time": "2012-10-30 09:00:00",
        "lat": 40.0,
        "lon": -77.0,
    },
    "2016273N13300": {
        "track_time": "2016-10-03 00:00:00",
        "lat": 14.5,
        "lon": -75.0,
    },
    "1989254N13340": {
        "track_time": "1989-09-21 18:00:00",
        "lat": 30.2,
        "lon": -77.5,
    },
    "2025294N14290": {
        "track_time": "2025-10-28 18:00:00",
        "lat": 18.2,
        "lon": -78.0,
    },
}

# Corners of the full GridSat grid (lat −70 to 69.93, lon −180 to 179.94).
FULL_GRIDSAT_BOUNDS = (-180.0, -70.0, 179.94, 69.93)
FULL_GRIDSAT_SIZE = (5143, 2000)

# Four corner latitudes and longitudes of a GOES-East full disk
# (subsatellite 75.2°W, limb about 81° out), used as one rectangle.
GOES_DISK_BOUNDS = (-75.2 - 81.0, -81.0, -75.2 + 81.0, 81.0)


def cell_km():
    return CELL_DEG * (math.pi / 180.0) * R_M / 1000.0


def merc_y(lat_deg):
    phi = math.radians(lat_deg)
    return math.log(math.tan(math.pi / 4.0 + phi / 2.0))


def inv_merc_y(y):
    return math.degrees(2.0 * math.atan(math.exp(y)) - math.pi / 2.0)


def haversine_km(lat1, lon1, lat2, lon2):
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = phi2 - phi1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2.0) ** 2
    return 2.0 * R_M * math.asin(math.sqrt(a)) / 1000.0


def mercator_center(bounds):
    west, south, east, north = bounds
    lon = (west + east) / 2.0
    lat = inv_merc_y((merc_y(south) + merc_y(north)) / 2.0)
    return lat, lon


def measure(bounds, width, height, step_km=STEP_KM):
    """Where the center pixel lands, and how long a 200 km cell-step is.

    Pixels are uniform in Web Mercator. A step of N pixels, N being 200 km
    divided by one 0.07° cell, is measured from the mercator center.
    """
    west, south, east, north = bounds
    lat0, lon0 = mercator_center(bounds)
    n_ns = step_km / cell_km()
    dy = (merc_y(north) - merc_y(south)) / height
    lat_n = inv_merc_y(merc_y(lat0) + n_ns * dy)
    ns_km = haversine_km(lat0, lon0, lat_n, lon0)

    n_ew = step_km / (cell_km() * math.cos(math.radians(lat0)))
    dlon = n_ew * (east - west) / width
    ew_km = haversine_km(lat0, lon0, lat0, lon0 + dlon)
    return lat0, lon0, ns_km, ew_km


def placement_errors(bounds, width, height, lat, lon):
    lat0, lon0, ns_km, ew_km = measure(bounds, width, height)
    return {
        "center_km": haversine_km(lat0, lon0, lat, lon),
        "ns_km": ns_km,
        "ew_km": ew_km,
        "ns_error_km": abs(ns_km - STEP_KM),
        "ew_error_km": abs(ew_km - STEP_KM),
    }


def placement_ok(bounds, width, height, lat, lon):
    tol = cell_km()
    errors = placement_errors(bounds, width, height, lat, lon)
    return (
        errors["center_km"] <= tol
        and errors["ns_error_km"] <= tol
        and errors["ew_error_km"] <= tol
    )


def jpeg_size(path: Path):
    data = path.read_bytes()
    assert data[:2] == b"\xff\xd8", path
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(data[i + 5 : i + 7], "big")
            width = int.from_bytes(data[i + 7 : i + 9], "big")
            return width, height
        if marker == 0xD8 or marker == 0xD9 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        i += 2 + length
    raise AssertionError(f"no JPEG frame header in {path}")


def is_gridsat_hour(date_time: str) -> bool:
    hour = int(date_time[11:13])
    minute = int(date_time[14:16])
    second = int(date_time[17:19])
    return second == 0 and minute == 0 and hour % 3 == 0


def three_hour_points():
    """Distinct GridSat hours on the four published tracks."""
    with gzip.open(STORMS_PATH, "rt") as fp:
        storms = json.load(fp)
    points = []
    for sid in SIDS:
        for point in storms[sid]["track_points"]:
            if is_gridsat_hour(point["date_time"]):
                points.append((sid, point))
    return points


def load_frames():
    body = json.loads(FRAMES_PATH.read_text())
    frames = body["frames"]
    by_key = {(frame["sid"], frame["trackTime"]): frame for frame in frames}
    assert len(by_key) == len(frames)
    return frames, by_key


def test_every_three_hour_track_time_has_a_frame():
    frames, by_key = load_frames()
    points = three_hour_points()
    assert len(frames) == len(points)
    counts = {sid: 0 for sid in SIDS}
    for sid, point in points:
        counts[sid] += 1
        frame = by_key[(sid, point["date_time"])]
        assert frame["sid"] == sid
        assert len(frame["bounds"]) == 4
        stamp = frame["gridsatTime"].replace("-", "").replace(":", "").replace(" ", "")[:12]
        image = FRAMES_PATH.parent / frame["image"]
        assert image.name == f"{sid}-{stamp}.jpg"
        width, height = jpeg_size(image)
        assert (width, height) == (301, 301)
        errors = placement_errors(
            frame["bounds"], width, height, point["latitude"], point["longitude"]
        )
        assert errors["center_km"] <= cell_km(), (
            f"{sid} {point['date_time']} center {errors['center_km']:.3f} km "
            f"from the track point"
        )
    # 82, 94, 124, and 93 track points include times that are not GridSat hours.
    assert counts == {
        "2012296N14283": 79,
        "2016273N13300": 93,
        "1989254N13340": 121,
        "2025294N14290": 89,
    }
    sandy_times = {frame["trackTime"] for frame in frames if frame["sid"] == "2012296N14283"}
    assert "2012-10-24 19:00:00" not in sandy_times
    assert "2012-10-24 18:00:00" in sandy_times
    assert "2012-10-24 21:00:00" in sandy_times


def test_four_frames_match_their_track_points():
    """Sandy and Matthew keep their original centers. Hugo and Melissa match one each.

    A 200 km step on these four frames measures 200 km within one 0.07° cell.
    """
    _frames, by_key = load_frames()
    points = {(sid, point["date_time"]): point for sid, point in three_hour_points()}
    tol = cell_km()
    for sid, track in CENTER_CHECKS.items():
        source = points[(sid, track["track_time"])]
        assert source["latitude"] == track["lat"]
        assert source["longitude"] == track["lon"]
        frame = by_key[(sid, track["track_time"])]
        width, height = jpeg_size(FRAMES_PATH.parent / frame["image"])
        errors = placement_errors(frame["bounds"], width, height, track["lat"], track["lon"])
        assert errors["center_km"] <= tol, (
            f"{sid} center {errors['center_km']:.3f} km from the track point"
        )
        assert errors["ns_error_km"] <= tol, (
            f"{sid} north-south step {errors['ns_km']:.3f} km"
        )
        assert errors["ew_error_km"] <= tol, (
            f"{sid} east-west step {errors['ew_km']:.3f} km"
        )


def test_full_grid_and_geostationary_disk_fail():
    """The same measurement rejects the two wrong rectangles."""
    _frames, by_key = load_frames()
    for sid, track in CENTER_CHECKS.items():
        frame = by_key[(sid, track["track_time"])]
        width, height = jpeg_size(FRAMES_PATH.parent / frame["image"])
        assert not placement_ok(FULL_GRIDSAT_BOUNDS, *FULL_GRIDSAT_SIZE, track["lat"], track["lon"])
        assert not placement_ok(FULL_GRIDSAT_BOUNDS, width, height, track["lat"], track["lon"])
        assert not placement_ok(GOES_DISK_BOUNDS, width, height, track["lat"], track["lon"])


@pytest.fixture(scope="module")
def gridsat():
    spec = importlib.util.spec_from_file_location("buildGridsatWindow", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _storms():
    with gzip.open(STORMS_PATH, "rt") as fp:
        return json.load(fp)


def _exact_points(storms, day):
    found = []
    for sid, storm in storms.items():
        for point in storm["track_points"]:
            when = point["date_time"]
            if when[:10] == day and is_gridsat_hour(when):
                found.append((sid, storm["name"], point))
    return found


def _write_storms(path: Path, payload):
    with gzip.open(path, "wb") as handle:
        handle.write(json.dumps(payload).encode("utf-8"))


def _jpeg(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xd8" + b"\x00" * 16 + b"\xff\xd9")


def test_slice_days_match_the_crop_counts():
    """The two slice days are 46 and 85 exact fixes, with no basin filter."""
    storms = _storms()
    counts = {day: _exact_points(storms, day) for day in SLICE_DAYS}
    assert len(counts["2023-10-20"]) == 46
    assert len(counts["1992-09-25"]) == 85
    names = {name for _sid, name, _point in counts["2023-10-20"]}
    assert names == {"TAMMY", "NORMA", "SANBA", "TEJ", "HAMOON", "LOLA"}
    assert all(abs(point["latitude"]) <= 30 for _sid, _name, point in counts["2023-10-20"])
    late = {name for _sid, name, point in counts["1992-09-25"] if abs(point["latitude"]) > 30}
    assert late <= POLEWARD_NAMES
    assert late
    unnamed = [
        point for _sid, name, point in counts["1992-09-25"]
        if name == "UNNAMED" and 80 < point["longitude"] < 100
    ]
    assert len(unnamed) == 1
    ward = [point["longitude"] for _sid, name, point in counts["1992-09-25"] if name == "WARD"]
    assert ward and min(ward) > 180


def test_computed_bounds_place_equatorward_and_poleward_frames(gridsat):
    """One frame from these days on each side of 30° passes the center and 200 km checks.

    The four corners of the full GridSat grid fail the same check.
    """
    storms = _storms()
    low = min(counts := _exact_points(storms, "2023-10-20"), key=lambda item: abs(item[2]["latitude"]))
    high = max(_exact_points(storms, "1992-09-25"), key=lambda item: abs(item[2]["latitude"]))
    assert abs(low[2]["latitude"]) < 30
    assert abs(high[2]["latitude"]) > 30
    assert high[1] in POLEWARD_NAMES
    for sid, name, point in (low, high):
        bounds = gridsat.catalog_bounds(point["latitude"], point["longitude"])
        assert bounds is not None
        assert placement_ok(bounds, 301, 301, point["latitude"], point["longitude"]), (
            f"{name} {sid} {placement_errors(bounds, 301, 301, point['latitude'], point['longitude'])}"
        )
        assert not placement_ok(
            FULL_GRIDSAT_BOUNDS, *FULL_GRIDSAT_SIZE, point["latitude"], point["longitude"]
        )
        assert not placement_ok(
            FULL_GRIDSAT_BOUNDS, 301, 301, point["latitude"], point["longitude"]
        )
    # The stored four-track bounds already pass. The fixed-grid formula has to as well.
    for sid, track in CENTER_CHECKS.items():
        bounds = gridsat.catalog_bounds(track["lat"], track["lon"])
        assert placement_ok(bounds, 301, 301, track["lat"], track["lon"]), sid
    lola = max(
        (point for _sid, name, point in counts if name == "LOLA"),
        key=lambda point: point["longitude"],
    )
    lola_bounds = gridsat.catalog_bounds(lola["latitude"], lola["longitude"])
    assert lola_bounds[2] > 180
    ward = next(point for _sid, name, point in _exact_points(storms, "1992-09-25") if name == "WARD")
    assert gridsat.wrap_lon(ward["longitude"]) < -170
    ward_bounds = gridsat.catalog_bounds(ward["latitude"], ward["longitude"])
    assert ward_bounds[0] < -180 < ward_bounds[2]
    assert placement_ok(ward_bounds, 301, 301, ward["latitude"], ward["longitude"])


def test_nodd_is_first_and_only_a_404_uses_ncei(tmp_path, gridsat, monkeypatch):
    seen = []

    def fail(url, dest):
        seen.append(url)
        raise gridsat.NotFound(url)

    monkeypatch.setattr(gridsat, "fetch", fail)
    with pytest.raises(gridsat.NotFound):
        gridsat.download_hour(
            "GRIDSAT-B1.1992.09.25.00.v02r01.nc", 1992, str(tmp_path / "missing.nc")
        )
    assert "noaa-cdr-gridsat-b1-pds.s3.amazonaws.com" in seen[0]
    assert seen[0].endswith("GRIDSAT-B1.1992.09.25.00.v02r01.nc")
    assert "ncei.noaa.gov" in seen[1]
    assert len(seen) == 2

    seen.clear()

    def nodd_ok(url, dest):
        seen.append(url)
        if "ncei.noaa.gov" in url:
            raise AssertionError(url)
        Path(dest).write_bytes(b"netcdf")

    monkeypatch.setattr(gridsat, "fetch", nodd_ok)
    assert gridsat.download_hour(
        "GRIDSAT-B1.1992.09.25.00.v02r01.nc", 1992, str(tmp_path / "ok.nc")
    ) == "nodd"
    assert len(seen) == 1


def test_server_error_does_not_fall_through(gridsat, monkeypatch):
    seen = []

    def fail(url, dest):
        seen.append(url)
        raise RuntimeError("http 500")

    monkeypatch.setattr(gridsat, "fetch", fail)
    with pytest.raises(RuntimeError):
        gridsat.download_hour("GRIDSAT-B1.1992.09.25.00.v02r01.nc", 1992, "/tmp/gridsat-500.nc")
    assert len(seen) == 1
    assert seen[0].startswith("https://noaa-cdr-gridsat-b1-pds.s3.amazonaws.com/")


def test_fetch_treats_only_404_as_missing(tmp_path, gridsat, monkeypatch):
    dest = tmp_path / "hour.nc"

    def run(cmd, **_kwargs):
        assert cmd[0] == "curl"
        assert "aws" not in cmd
        assert cmd[-1].startswith("https://")

        class Proc:
            returncode = 22
            stdout = "404"
            stderr = "The requested URL returned error: 404"

        return Proc()

    monkeypatch.setattr(gridsat.subprocess, "run", run)
    with pytest.raises(gridsat.NotFound):
        gridsat.fetch("https://example.invalid/hour.nc", str(dest))


def _one_storm(sid, when, lat, lon):
    return {
        sid: {
            "id": sid,
            "name": "TEST",
            "track_points": [{
                "date_time": when,
                "latitude": lat,
                "longitude": lon,
            }],
        }
    }


def test_absent_hour_is_skipped_until_recheck(tmp_path, gridsat, monkeypatch):
    storms = tmp_path / "storms.json.gz"
    _write_storms(storms, _one_storm("1992265N18099", "1992-09-25 00:00:00", 21.7, 87.7))
    out = tmp_path / "out"
    calls = []

    def fail(url, dest):
        calls.append(url)
        raise gridsat.NotFound(url)

    monkeypatch.setattr(gridsat, "fetch", fail)
    argv = ["--dates", "1992-09-25", "--out", str(out), "--storms", str(storms)]
    gridsat.main(argv)
    manifest = json.loads((out / "manifest.json").read_text())
    hour = manifest["hours"]["GRIDSAT-B1.1992.09.25.00.v02r01.nc"]
    assert hour["status"] == "absent"
    assert hour["frames"] == []
    assert len(calls) == 2
    calls.clear()
    gridsat.main(argv)
    assert calls == []
    gridsat.main(argv + ["--recheck-absent"])
    assert len(calls) == 2


def test_complete_hour_skips_the_download(tmp_path, gridsat, monkeypatch):
    storms = tmp_path / "storms.json.gz"
    sid = "1992269S05087"
    _write_storms(storms, _one_storm(sid, "1992-09-25 00:00:00", -5.0, 88.0))
    out = tmp_path / "out"
    rel = f"{sid}/199209250000.jpg"
    _jpeg(out / rel)
    name = "GRIDSAT-B1.1992.09.25.00.v02r01.nc"
    (out / "manifest.json").write_text(json.dumps({
        "hours": {name: {"status": "complete", "source": "nodd", "frames": [rel]}}
    }))

    def fail(url, dest):
        raise AssertionError(url)

    monkeypatch.setattr(gridsat, "fetch", fail)
    gridsat.main(["--dates", "1992-09-25", "--out", str(out), "--storms", str(storms)])


def test_worker_count_is_one_through_eight(gridsat):
    assert gridsat.parse_args(["--dates", "1992-09-25"]).workers == 1
    assert gridsat.parse_args(["--dates", "1992-09-25", "--workers", "8"]).workers == 8
    with pytest.raises(SystemExit):
        gridsat.parse_args(["--dates", "1992-09-25", "--workers", "0"])
    with pytest.raises(SystemExit):
        gridsat.parse_args(["--dates", "1992-09-25", "--workers", "9"])


def test_claim_hour_hands_each_name_once(tmp_path, gridsat):
    directory = tmp_path / "claims"
    names = ["hour-a.nc", "hour-b.nc"]
    gridsat.prepare_claims(str(directory), names)
    assert gridsat.claim_hour(str(directory), names) == "hour-a.nc"
    assert gridsat.claim_hour(str(directory), names) == "hour-b.nc"
    assert gridsat.claim_hour(str(directory), names) is None


_CLAIM_CHILD = textwrap.dedent(
    """
    import importlib.util, sys
    script, directory = sys.argv[1:]
    spec = importlib.util.spec_from_file_location("buildGridsatWindow", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    names = mod.read_claim_names(directory)
    got = []
    while True:
        name = mod.claim_hour(directory, names)
        if name is None:
            break
        got.append(name)
    for name in got:
        print(name)
    """
)


def test_two_processes_claim_different_hours(tmp_path, gridsat):
    """Two processes drain one list. A name is claimed once."""
    directory = tmp_path / "claims"
    names = [f"hour-{index:02d}.nc" for index in range(20)]
    gridsat.prepare_claims(str(directory), names)
    procs = [
        subprocess.Popen(
            [sys.executable, "-c", _CLAIM_CHILD, str(SCRIPT), str(directory)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(2)
    ]
    claimed = []
    for proc in procs:
        stdout, stderr = proc.communicate(timeout=30)
        assert proc.returncode == 0, stderr
        claimed.extend(line for line in stdout.splitlines() if line)
    assert sorted(claimed) == names
    assert len(claimed) == len(set(claimed))


_RECORD_CHILD = textwrap.dedent(
    """
    import importlib.util, sys
    script, path, name, ready = sys.argv[1:]
    spec = importlib.util.spec_from_file_location("buildGridsatWindow", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if ready != "-":
        open(ready, "w").close()
    mod.write_hour_record(path, name, {"status": "complete", "frames": [name + ".jpg"]})
    """
)


def test_two_hour_records_both_survive(tmp_path):
    """Concurrent writers each add one hour, and a blocked writer keeps the other."""
    path = tmp_path / "manifest.json"
    procs = [
        subprocess.Popen(
            [sys.executable, "-c", _RECORD_CHILD, str(SCRIPT), str(path), name, "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for name in ("hour-a.nc", "hour-b.nc")
    ]
    for proc in procs:
        _stdout, stderr = proc.communicate(timeout=30)
        assert proc.returncode == 0, stderr
    body = json.loads(path.read_text())
    assert body["hours"]["hour-a.nc"]["frames"] == ["hour-a.nc.jpg"]
    assert body["hours"]["hour-b.nc"]["frames"] == ["hour-b.nc.jpg"]

    locked = tmp_path / "locked.json"
    ready = tmp_path / "ready"
    lock_fd = os.open(str(locked) + ".lock", os.O_CREAT | os.O_RDWR, 0o644)
    fcntl.flock(lock_fd, fcntl.LOCK_EX)
    proc = subprocess.Popen(
        [sys.executable, "-c", _RECORD_CHILD, str(SCRIPT), str(locked), "hour-b.nc", str(ready)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        deadline = time.time() + 10
        while not ready.exists():
            if proc.poll() is not None:
                raise AssertionError("writer exited before the lock")
            if time.time() > deadline:
                raise AssertionError("writer did not start")
            time.sleep(0.01)
        time.sleep(0.5)
        locked.write_text(json.dumps({
            "hours": {"hour-a.nc": {"status": "complete", "frames": ["a.jpg"]}}
        }) + "\n")
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)
        if proc.poll() is None and not ready.exists():
            proc.kill()
    _stdout, stderr = proc.communicate(timeout=30)
    assert proc.returncode == 0, stderr
    body = json.loads(locked.read_text())
    assert body["hours"]["hour-a.nc"]["frames"] == ["a.jpg"]
    assert body["hours"]["hour-b.nc"]["frames"] == ["hour-b.nc.jpg"]


def _two_complete_hours(tmp_path):
    """Two finished hours. An empty source dir means a miss cannot download."""
    storms_path = tmp_path / "storms.json.gz"
    out = tmp_path / "out"
    source = tmp_path / "source"
    source.mkdir()
    points = {
        "1992269S05087": ("1992-09-25 00:00:00", -5.0, 88.0),
        "1992268N11193": ("1992-09-25 03:00:00", 12.5, 186.0),
    }
    payload = {}
    manifest_hours = {}
    for sid, (when, lat, lon) in points.items():
        payload[sid] = {
            "id": sid,
            "name": "TEST",
            "track_points": [{
                "date_time": when,
                "latitude": lat,
                "longitude": lon,
            }],
        }
        stamp = when.replace("-", "").replace(":", "").replace(" ", "")[:12]
        rel = f"{sid}/{stamp}.jpg"
        _jpeg(out / rel)
        name = (
            "GRIDSAT-B1."
            + when[0:4] + "." + when[5:7] + "." + when[8:10] + "."
            + when[11:13] + ".v02r01.nc"
        )
        manifest_hours[name] = {"status": "complete", "source": "nodd", "frames": [rel]}
    _write_storms(storms_path, payload)
    (out / "manifest.json").write_text(json.dumps({"hours": manifest_hours}) + "\n")
    return storms_path, out, source, manifest_hours


def _forbid_popen(gridsat, monkeypatch):
    def fail(*_args, **_kwargs):
        raise AssertionError("started another process")

    monkeypatch.setattr(gridsat.subprocess, "Popen", fail)


def test_one_worker_does_not_start_a_process(tmp_path, gridsat, monkeypatch):
    storms_path, out, source, manifest_hours = _two_complete_hours(tmp_path)
    _forbid_popen(gridsat, monkeypatch)
    gridsat.main([
        "--dates", "1992-09-25",
        "--out", str(out),
        "--storms", str(storms_path),
        "--source-dir", str(source),
        "--workers", "1",
    ])
    body = json.loads((out / "manifest.json").read_text())
    assert set(body["hours"]) == set(manifest_hours)


def test_one_hour_stays_in_this_process(tmp_path, gridsat, monkeypatch):
    """Eight workers and one hour still run in this process."""
    storms = tmp_path / "storms.json.gz"
    sid = "1992269S05087"
    _write_storms(storms, _one_storm(sid, "1992-09-25 00:00:00", -5.0, 88.0))
    out = tmp_path / "out"
    source = tmp_path / "source"
    source.mkdir()
    rel = f"{sid}/199209250000.jpg"
    _jpeg(out / rel)
    name = "GRIDSAT-B1.1992.09.25.00.v02r01.nc"
    (out / "manifest.json").write_text(json.dumps({
        "hours": {name: {"status": "complete", "source": "nodd", "frames": [rel]}}
    }))
    _forbid_popen(gridsat, monkeypatch)
    gridsat.main([
        "--dates", "1992-09-25",
        "--out", str(out),
        "--storms", str(storms),
        "--source-dir", str(source),
        "--workers", "8",
    ])
    body = json.loads((out / "manifest.json").read_text())
    assert body["hours"][name]["frames"] == [rel]
    assert body["hours"][name]["status"] == "complete"


def test_two_workers_keep_both_hour_records(tmp_path):
    """Two processes skip two finished hours, and both records remain."""
    storms_path, out, source, manifest_hours = _two_complete_hours(tmp_path)
    proc = subprocess.run(
        [
            sys.executable, str(SCRIPT),
            "--dates", "1992-09-25",
            "--out", str(out),
            "--storms", str(storms_path),
            "--source-dir", str(source),
            "--workers", "2",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    log = tmp_path / "workers.log"
    log.write_text(proc.stdout + "\n" + proc.stderr)
    assert proc.returncode == 0, proc.stderr[-2000:]
    claimed = [
        line.split()[-1]
        for line in proc.stdout.splitlines()
        if line.startswith("claim ")
    ]
    assert sorted(claimed) == sorted(manifest_hours)
    assert len(claimed) == len(set(claimed))
    assert "open " not in proc.stdout
    body = json.loads((out / "manifest.json").read_text())
    assert set(body["hours"]) == set(manifest_hours)
    for name, record in manifest_hours.items():
        assert body["hours"][name]["status"] == "complete"
        assert body["hours"][name]["frames"] == record["frames"]


def test_date_line_join_and_fill(tmp_path):
    """A contiguous longitude slice misses the date line. A fill window writes no JPEG.

    The NetCDF is synthetic and the child does not download. The fill file is
    only a few MB and is opened and recorded empty, not skipped for its length.
    """
    child = textwrap.dedent(
        """
        import gzip, json, os, sys
        import numpy as np
        import netCDF4 as nc
        import importlib.util

        script, work = sys.argv[1], sys.argv[2]
        spec = importlib.util.spec_from_file_location("buildGridsatWindow", script)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        nlat, nlon = 400, 5143
        lat = np.arange(nlat, dtype=np.float64) * 0.07
        lon = -180.0 + np.arange(nlon, dtype=np.float64) * 0.07

        def write_nc(path, hour, values):
            ds = nc.Dataset(path, "w")
            ds.createDimension("time", 1)
            ds.createDimension("lat", nlat)
            ds.createDimension("lon", nlon)
            lat_v = ds.createVariable("lat", "f8", ("lat",))
            lon_v = ds.createVariable("lon", "f8", ("lon",))
            time_v = ds.createVariable("time", "f8", ("time",))
            time_v.units = "hours since 1992-09-25 00:00:00"
            time_v.calendar = "standard"
            time_v[0] = hour
            lat_v[:] = lat
            lon_v[:] = lon
            var = ds.createVariable("irwin_cdr", "i2", ("time", "lat", "lon"), fill_value=np.int16(-9999))
            var.scale_factor = np.float32(1.0)
            var.add_offset = np.float32(0.0)
            var.valid_range = np.array([100.0, 320.0], dtype="f4")
            var[0, :, :] = values
            ds.close()

        source = os.path.join(work, "src")
        os.makedirs(source)
        fill = np.full((nlat, nlon), -9999, dtype=np.int16)
        scene = np.full((nlat, nlon), -9999, dtype=np.int16)
        scene[:, -8:] = np.int16(250)
        write_nc(os.path.join(source, "GRIDSAT-B1.1992.09.25.00.v02r01.nc"), 0, fill)
        write_nc(os.path.join(source, "GRIDSAT-B1.1992.09.25.03.v02r01.nc"), 3, scene)

        window = mod.read_window(np, nc, os.path.join(source, "GRIDSAT-B1.1992.09.25.03.v02r01.nc"), 12.5, 186.0)
        assert window is not None
        assert np.any(np.isclose(window["grid"], 250.0)), "joined window missed the east edge"
        dlon = (lon - mod.wrap_lon(186.0) + 180.0) % 360.0 - 180.0
        j_c = int(np.argmin(np.abs(dlon)))
        half = mod.CENTER + mod.PAD
        j0 = max(0, j_c - half)
        j1 = min(nlon, j_c + half + 1)
        assert not np.any(scene[:, j0:j1] == 250), "fixture: contiguous slice already saw the seam"

        storms = {
            "1992265N18099": {
                "id": "1992265N18099",
                "name": "UNNAMED",
                "track_points": [{"date_time": "1992-09-25 00:00:00", "latitude": 21.7, "longitude": 87.7}],
            },
            "1992268N11193": {
                "id": "1992268N11193",
                "name": "WARD",
                "track_points": [{"date_time": "1992-09-25 03:00:00", "latitude": 12.5, "longitude": 186.0}],
            },
        }
        storms_path = os.path.join(work, "storms.json.gz")
        with gzip.open(storms_path, "wb") as handle:
            handle.write(json.dumps(storms).encode("utf-8"))
        out = os.path.join(work, "out")
        mod.main([
            "--dates", "1992-09-25",
            "--out", out,
            "--storms", storms_path,
            "--source-dir", source,
        ])
        manifest = json.load(open(os.path.join(out, "manifest.json")))
        assert manifest["hours"]["GRIDSAT-B1.1992.09.25.00.v02r01.nc"]["status"] == "empty"
        assert manifest["hours"]["GRIDSAT-B1.1992.09.25.00.v02r01.nc"]["frames"] == []
        ward = manifest["hours"]["GRIDSAT-B1.1992.09.25.03.v02r01.nc"]
        assert ward["status"] == "complete"
        assert ward["frames"] == ["1992268N11193/199209250300.jpg"]
        jpeg = os.path.join(out, "1992268N11193", "199209250300.jpg")
        data = open(jpeg, "rb").read()
        assert data[:2] == b"\\xff\\xd8" and data[-2:] == b"\\xff\\xd9"
        assert not os.path.exists(os.path.join(out, "1992265N18099", "199209250000.jpg"))
        print("seam-fill ok")
        """
    )
    proc = subprocess.run(
        [
            "uv", "run", "--with", "netCDF4", "--with", "numpy",
            "--with", "pillow", "--with", "matplotlib",
            "python", "-c", child, str(SCRIPT), str(tmp_path),
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=180,
    )
    log = tmp_path / "child.log"
    log.write_text(proc.stdout + "\n" + proc.stderr)
    assert proc.returncode == 0, proc.stderr[-2000:]
    assert "seam-fill ok" in proc.stdout
    assert "empty" in proc.stdout
    assert "open " in proc.stdout


def test_recorded_errors(capsys):
    """Print the measured kilometers. The assertions live in the tests above."""
    _frames, by_key = load_frames()
    lines = []
    for sid, track in CENTER_CHECKS.items():
        frame = by_key[(sid, track["track_time"])]
        width, height = jpeg_size(FRAMES_PATH.parent / frame["image"])
        errors = placement_errors(frame["bounds"], width, height, track["lat"], track["lon"])
        lines.append(
            f"{sid} center {errors['center_km']:.3f} km "
            f"ns {errors['ns_km']:.3f} km ew {errors['ew_km']:.3f} km"
        )
    print("\n".join(lines))
    captured = capsys.readouterr()
    for line in lines:
        assert line in captured.out
