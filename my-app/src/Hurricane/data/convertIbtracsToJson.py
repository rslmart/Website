"""Convert the IBTrACS global best-track NetCDF into the JSON shape the
Hurricane page expects (mirrors convertHurdatToJson.py, but global).

Run with uv (no persistent venv needed):
    uv run --with netCDF4 --with numpy --with geopy python convertIbtracsToJson.py

Output: ../../../public/hurricane/storms.json  (fetched at runtime by Hurricane.jsx)

Field mapping notes:
- Position/time come from the always-present `lat`/`lon`/`iso_time`.
- Wind/pressure coalesce the US agency value (1-min knots / mb) and fall
  back to the WMO value so non-US basins still get data.
- Wind radii (usa_r34/r50/r64, quadrants NE/SE/SW/NW) and radius-of-max-wind
  (usa_rmw) are only reported for US-agency storms; polygons are added only
  where present.
- IBTrACS has no IR satellite imagery, so there is no ir_image_url (the
  frontend already renders that field conditionally).
"""
import gzip
import json
import os

import numpy as np
import netCDF4 as nc
import geopy.distance

NC_PATH = "../IBTrACS.ALL.v04r01.nc"
# Gzipped because the raw JSON is ~185 MB; the frontend decompresses it in the
# browser via DecompressionStream. Keeps the repo and the transfer small.
OUT_PATH = "../../../public/hurricane/storms.json.gz"

# IBTrACS quadrant dimension order is NE, SE, SW, NW.
QUADRANTS = ["ne", "se", "sw", "nw"]
BEARING = {"ne": 45, "se": 135, "sw": 225, "nw": 315}

# usa_status already uses HURDAT-style codes; map the coarse `nature` codes
# (used when no US status exists) onto the frontend's status vocabulary.
NATURE_TO_STATUS = {"TS": "TS", "ET": "EX", "SS": "SS", "DS": "DB", "NR": "", "MX": ""}


def new_coordinates(lon, lat, bearing, distance_nm):
    point = geopy.distance.distance(nautical=distance_nm).destination((lat, lon), bearing)
    return [round(point.longitude, 3), round(point.latitude, 3)]


def add_wind_polygons(track_point, radii):
    """radii maps threshold -> [ne, se, sw, nw] nautical-mile values."""
    lon, lat = track_point["longitude"], track_point["latitude"]
    for threshold, quad_values in radii.items():
        for i, quad in enumerate(QUADRANTS):
            r = quad_values[i]
            if not r or r <= 0:
                continue
            corner = new_coordinates(lon, lat, BEARING[quad], r)
            bot_top = new_coordinates(lon, lat, 0 if quad[0] == "n" else 180, r)
            left_right = new_coordinates(lon, lat, 90 if quad[1] == "e" else 270, r)
            track_point[f"{threshold}_{quad}_poly"] = [[lon, lat], bot_top, corner, left_right, [lon, lat]]


def add_max_wind_polygon(track_point, rmw_nm):
    lon, lat = track_point["longitude"], track_point["latitude"]
    north = new_coordinates(lon, lat, 0, rmw_nm)
    east = new_coordinates(lon, lat, 90, rmw_nm)
    south = new_coordinates(lon, lat, 180, rmw_nm)
    west = new_coordinates(lon, lat, 270, rmw_nm)
    track_point["max_wind_poly"] = [north, east, south, west, north]


def cell(value):
    """Return a masked/NaN cell as None, otherwise a plain python scalar."""
    if value is np.ma.masked or (np.ma.is_masked(value)):
        return None
    if isinstance(value, (np.floating,)) and np.isnan(value):
        return None
    return value.item() if hasattr(value, "item") else value


def main():
    ds = nc.Dataset(NC_PATH)
    n_storms = ds.dimensions["storm"].size

    # Bulk-read once; per-element NetCDF access is far too slow.
    numobs = ds.variables["numobs"][:]
    season = ds.variables["season"][:]
    number = ds.variables["number"][:]
    lat = ds.variables["lat"][:]
    lon = ds.variables["lon"][:]
    usa_wind = ds.variables["usa_wind"][:]
    wmo_wind = ds.variables["wmo_wind"][:]
    usa_pres = ds.variables["usa_pres"][:]
    wmo_pres = ds.variables["wmo_pres"][:]
    usa_rmw = ds.variables["usa_rmw"][:]
    usa_r34 = ds.variables["usa_r34"][:]
    usa_r50 = ds.variables["usa_r50"][:]
    usa_r64 = ds.variables["usa_r64"][:]
    landfall = ds.variables["landfall"][:]

    sid = nc.chartostring(ds.variables["sid"][:])
    name = nc.chartostring(ds.variables["name"][:])
    iso_time = nc.chartostring(ds.variables["iso_time"][:])
    basin = nc.chartostring(ds.variables["basin"][:])
    nature = nc.chartostring(ds.variables["nature"][:])
    usa_status = nc.chartostring(ds.variables["usa_status"][:])
    usa_record = nc.chartostring(ds.variables["usa_record"][:])
    usa_atcf_id = nc.chartostring(ds.variables["usa_atcf_id"][:])

    storms = {}
    min_season, max_season = 10_000, 0

    for s in range(n_storms):
        obs = int(numobs[s])
        if obs <= 0:
            continue
        storm_id = str(sid[s]).strip()
        storm_name = str(name[s]).strip() or "UNNAMED"
        storm_season = int(season[s])
        storm_basin = ""
        atcf_id = ""
        track_points = []
        status_list = set()
        record_list = set()
        max_wind = 0
        min_pressure = None

        for t in range(obs):
            iso = str(iso_time[s, t]).strip()
            if not iso:
                continue
            plat = cell(lat[s, t])
            plon = cell(lon[s, t])
            if plat is None or plon is None:
                continue

            if not storm_basin:
                b = str(basin[s, t]).strip()
                if b:
                    storm_basin = b

            if not atcf_id:
                aid = str(usa_atcf_id[s, t]).strip()
                if aid:
                    atcf_id = aid

            wind = cell(usa_wind[s, t])
            if wind is None:
                wind = cell(wmo_wind[s, t])
            wind = int(wind) if wind is not None and wind > 0 else 0

            pressure = cell(usa_pres[s, t])
            if pressure is None:
                pressure = cell(wmo_pres[s, t])

            status = str(usa_status[s, t]).strip()
            if not status:
                status = NATURE_TO_STATUS.get(str(nature[s, t]).strip(), "")

            record = str(usa_record[s, t]).strip()
            if not record and cell(landfall[s, t]) == 0:
                record = "L"

            date, time = iso.split(" ")
            year, month, day = (int(x) for x in date.split("-"))
            hours, minutes = int(time[0:2]), int(time[3:5])

            track_point = {
                "id": storm_id,
                "year": year,
                "month": month,
                "hours": hours,
                "minutes": minutes,
                "date_time": iso,
                "status": status,
                "record_type": record,
                "latitude": round(plat, 2),
                "longitude": round(plon, 2),
                "wind": wind,
            }
            if pressure is not None and pressure > 0:
                track_point["pressure"] = int(pressure)

            rmw = cell(usa_rmw[s, t])
            if rmw is not None and rmw > 0:
                track_point["max_wind_radius"] = int(rmw)
                add_max_wind_polygon(track_point, rmw)

            radii = {
                "34": [cell(v) for v in usa_r34[s, t]],
                "50": [cell(v) for v in usa_r50[s, t]],
                "64": [cell(v) for v in usa_r64[s, t]],
            }
            if any(v and v > 0 for vals in radii.values() for v in vals):
                add_wind_polygons(track_point, radii)

            track_points.append(track_point)
            if status:
                status_list.add(status)
            if record:
                record_list.add(record)
            if wind > max_wind:
                max_wind = wind
            if "pressure" in track_point and (min_pressure is None or track_point["pressure"] < min_pressure):
                min_pressure = track_point["pressure"]

        if not track_points:
            continue

        storm = {
            "name": storm_name,
            "basin": storm_basin,
            "number": int(number[s]),
            "season": storm_season,
            "id": storm_id,
            "max_wind": max_wind,
            "status_list": sorted(status_list),
            "record_type_list": sorted(record_list),
            "track_points": track_points,
        }
        if min_pressure is not None:
            storm["min_pressure"] = min_pressure
        # ATCF id (e.g. "AL052019") lets the frontend build RAMMB/CIRA IR image URLs.
        if atcf_id:
            storm["atcf_id"] = atcf_id

        # sid is unique per storm; guard against the rare duplicate just in case.
        key = storm_id if storm_id not in storms else f"{storm_id}_{s}"
        storms[key] = storm
        min_season = min(min_season, storm_season)
        max_season = max(max_season, storm_season)

    ds.close()

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    payload = json.dumps(storms, separators=(",", ":")).encode("utf-8")
    with gzip.open(OUT_PATH, "wb", compresslevel=9) as fp:
        fp.write(payload)

    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    raw_mb = len(payload) / (1024 * 1024)
    print(f"Wrote {len(storms)} storms to {OUT_PATH} ({size_mb:.1f} MB gzipped, {raw_mb:.1f} MB raw)")
    print(f"Seasons: {min_season}-{max_season}")


if __name__ == "__main__":
    main()
