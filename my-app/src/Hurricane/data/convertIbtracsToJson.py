"""Convert the IBTrACS global best-track NetCDF into the JSON the Hurricane page serves.

Run with uv (no persistent venv needed):
    uv run --with netCDF4 --with numpy --with geopy python convertIbtracsToJson.py

Output: ../../../public/hurricane/storms.json.gz  (fetched at runtime by Hurricane.jsx)

Field mapping notes:
- Position/time come from the always-present `lat`/`lon`/`iso_time`.
- Wind coalesces the US agency value (1-minute knots) and falls back to the
  WMO value. A point with neither is `wind: null`, not 0, and carries no
  `wind_source`. `wind_source` is "usa" (1-minute) or "wmo" (the reporting
  agency's period, often 10 minutes). Pressure coalesces the same way and is
  omitted when missing.
- `record_type` "L" is a coastline crossing: `usa_record` "L", or `landfall`
  == 0 while `dist2land` > 0. `landfall` == 0 on a point already over land
  (`dist2land` == 0) is not a crossing.
- `track_type` is copied from IBTrACS. `provisional` is true when that string
  contains PROVISIONAL. Spur tracks stay in the file and are flagged so the
  page can keep them out of the aggregate views.
- Wind radii (usa_r34/r50/r64, quadrants NE/SE/SW/NW) and radius-of-max-wind
  (usa_rmw) are only reported for US-agency storms; polygons are added only
  where present.
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


def coastline_record(usa_record, landfall_km, dist2land_km):
    """Record type. "L" only for a real sea-to-land crossing.

    A USA record is kept as-is, including "L". Otherwise IBTrACS `landfall`
    == 0 means the track reaches land before the next fix. That is a crossing
    only while this point is still offshore (`dist2land` > 0). A fix that is
    already inland (`dist2land` == 0) is not a landfall.
    """
    record = (usa_record or "").strip()
    if record:
        return record
    if landfall_km == 0 and dist2land_km is not None and dist2land_km > 0:
        return "L"
    return ""


def reported_wind(usa_wind, wmo_wind):
    """USA 1-minute wind, else the WMO value, else missing.

    A reported 0 stays 0. Missing on both sources is None, not 0.
    Returns (knots or None, "usa" or "wmo" or None).
    """
    if usa_wind is not None:
        knots = int(usa_wind) if usa_wind > 0 else 0
        return knots, "usa"
    if wmo_wind is not None:
        knots = int(wmo_wind) if wmo_wind > 0 else 0
        return knots, "wmo"
    return None, None


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


def main(nc_path=None, out_path=None):
    """Write storms.json.gz. Defaults are the module path constants."""
    nc_path = NC_PATH if nc_path is None else nc_path
    out_path = OUT_PATH if out_path is None else out_path
    ds = nc.Dataset(nc_path)
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
    dist2land = ds.variables["dist2land"][:]

    sid = nc.chartostring(ds.variables["sid"][:])
    name = nc.chartostring(ds.variables["name"][:])
    iso_time = nc.chartostring(ds.variables["iso_time"][:])
    basin = nc.chartostring(ds.variables["basin"][:])
    nature = nc.chartostring(ds.variables["nature"][:])
    usa_status = nc.chartostring(ds.variables["usa_status"][:])
    usa_record = nc.chartostring(ds.variables["usa_record"][:])
    usa_atcf_id = nc.chartostring(ds.variables["usa_atcf_id"][:])
    track_type = nc.chartostring(ds.variables["track_type"][:])

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
        max_wind = None
        min_pressure = None
        storm_track_type = str(track_type[s]).strip()

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

            wind, wind_source = reported_wind(cell(usa_wind[s, t]), cell(wmo_wind[s, t]))

            pressure = cell(usa_pres[s, t])
            if pressure is None:
                pressure = cell(wmo_pres[s, t])

            status = str(usa_status[s, t]).strip()
            if not status:
                status = NATURE_TO_STATUS.get(str(nature[s, t]).strip(), "")

            record = coastline_record(
                str(usa_record[s, t]),
                cell(landfall[s, t]),
                cell(dist2land[s, t]),
            )

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
            if wind_source:
                track_point["wind_source"] = wind_source
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
            if wind is not None and (max_wind is None or wind > max_wind):
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
            "track_type": storm_track_type,
            "status_list": sorted(status_list),
            "record_type_list": sorted(record_list),
            "track_points": track_points,
        }
        if "PROVISIONAL" in storm_track_type:
            storm["provisional"] = True
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

    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    payload = json.dumps(storms, separators=(",", ":")).encode("utf-8")
    with gzip.open(out_path, "wb", compresslevel=9) as fp:
        fp.write(payload)

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    raw_mb = len(payload) / (1024 * 1024)
    print(f"Wrote {len(storms)} storms to {out_path} ({size_mb:.1f} MB gzipped, {raw_mb:.1f} MB raw)")
    print(f"Seasons: {min_season}-{max_season}")


if __name__ == "__main__":
    main()
