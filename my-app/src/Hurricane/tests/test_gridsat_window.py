"""Size of the two committed GridSat frames.

Reads public/hurricane/gridsat/frames.json and the two JPEGs. It does not
download and it does not import the crop script. pytest-socket blocks
sockets here. A crop, if one has to be run again, is a subprocess:

    uv run --with netCDF4 --with numpy --with pillow --with matplotlib \
        python buildGridsatWindow.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

HURRICANE_DIR = Path(__file__).resolve().parents[1]
FRAMES_PATH = HURRICANE_DIR.parents[1] / "public" / "hurricane" / "gridsat" / "frames.json"

# EPSG:3857 sphere. One 0.07° latitude cell is about 8 km on this sphere.
R_M = 6378137.0
CELL_DEG = 0.07
STEP_KM = 200.0

TRACKS = {
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


def load_frames():
    body = json.loads(FRAMES_PATH.read_text())
    frames = body["frames"]
    by_sid = {frame["sid"]: frame for frame in frames}
    assert set(by_sid) == set(TRACKS)
    return by_sid


def test_frames_match_the_track_points():
    frames = load_frames()
    tol = cell_km()
    for sid, track in TRACKS.items():
        frame = frames[sid]
        assert frame["trackTime"] == track["track_time"]
        assert len(frame["bounds"]) == 4
        image = FRAMES_PATH.parent / frame["image"]
        assert image.name == f"{sid}-{frame['gridsatTime'].replace('-', '').replace(':', '').replace(' ', '')[:12]}.jpg"
        width, height = jpeg_size(image)
        assert (width, height) == (301, 301)
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
    frames = load_frames()
    for sid, track in TRACKS.items():
        width, height = jpeg_size(FRAMES_PATH.parent / frames[sid]["image"])
        assert not placement_ok(FULL_GRIDSAT_BOUNDS, *FULL_GRIDSAT_SIZE, track["lat"], track["lon"])
        assert not placement_ok(FULL_GRIDSAT_BOUNDS, width, height, track["lat"], track["lon"])
        assert not placement_ok(GOES_DISK_BOUNDS, width, height, track["lat"], track["lon"])


def test_recorded_errors(capsys):
    """Print the measured kilometers. The assertions live in the test above."""
    frames = load_frames()
    lines = []
    for sid, track in TRACKS.items():
        frame = frames[sid]
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
