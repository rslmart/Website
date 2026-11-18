"""Size of the committed GridSat frames for four full tracks.

Reads public/hurricane/gridsat/frames.json, the JPEGs, and the published
storm file for the three-hour track times. It does not download and it does
not import the crop script. pytest-socket blocks sockets here. A crop, if
one has to be run again, is a subprocess:

    uv run --with netCDF4 --with numpy --with pillow --with matplotlib \
        python buildGridsatWindow.py
"""

from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

HURRICANE_DIR = Path(__file__).resolve().parents[1]
PUBLIC_HURRICANE = HURRICANE_DIR.parents[1] / "public" / "hurricane"
FRAMES_PATH = PUBLIC_HURRICANE / "gridsat" / "frames.json"
STORMS_PATH = PUBLIC_HURRICANE / "storms.json.gz"

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
