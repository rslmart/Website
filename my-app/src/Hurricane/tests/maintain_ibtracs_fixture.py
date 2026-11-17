"""Maintainer-only: cut a few storms out of the local IBTrACS NetCDF.

Not a test, and not part of the pipeline. Pytest never runs this. The 23MB
source is gitignored; this script only reads the checkout copy and writes
the small fixture next to itself. It does not download a replacement.

    uv run --offline --no-project --python 3.14 \\
        --with netCDF4==1.7.5.1.post1 --with numpy==2.5.5 \\
        python maintain_ibtracs_fixture.py

Source checked 2026-11-17:
/Users/russellmartin/Personal/Website/my-app/src/Hurricane/IBTrACS.ALL.v04r01.nc
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

SOURCE = Path(
    "/Users/russellmartin/Personal/Website/my-app/src/Hurricane/IBTrACS.ALL.v04r01.nc"
)

# Chosen from that file on 2026-11-17. Short storms that cover the cases the
# tests assert: a main track with wind radii, a sea-to-land crossing, an
# already-inland landfall==0 point and a missing wind; a spur; a season-2026
# storm (the file's newest season; it has no 2027).
STORM_SIDS = (
    "2009011S16139",  # CHARLOTTE, main, 2009
    "1975289N13129",  # FLOSSIE, spur-merge, 1975
    "2026021S26041",  # EWETSE, PROVISIONAL, season 2026
)

# Everything convertIbtracsToJson.main reads, plus dist2land and track_type
# so the source extract can name the landfall and spur cases.
VARIABLES = (
    "numobs",
    "season",
    "number",
    "lat",
    "lon",
    "usa_wind",
    "wmo_wind",
    "usa_pres",
    "wmo_pres",
    "usa_rmw",
    "usa_r34",
    "usa_r50",
    "usa_r64",
    "landfall",
    "dist2land",
    "sid",
    "name",
    "iso_time",
    "basin",
    "nature",
    "usa_status",
    "usa_record",
    "usa_atcf_id",
    "track_type",
)

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "ibtracs_few_storms.nc"
SOURCE_EXTRACT = HERE / "fixtures" / "ibtracs_few_storms.json"


def _cell(value):
    import numpy as np

    if value is np.ma.masked or np.ma.is_masked(value):
        return None
    if isinstance(value, np.floating) and np.isnan(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace").strip()
    if isinstance(value, str):
        return value.strip()
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _subset(src, dst, indices, max_obs):
    import numpy as np

    for name, dim in src.dimensions.items():
        if name == "storm":
            dst.createDimension(name, len(indices))
        elif name == "date_time":
            dst.createDimension(name, max_obs)
        else:
            dst.createDimension(name, len(dim))
    for key in src.ncattrs():
        dst.setncattr(key, src.getncattr(key))
    dst.setncattr(
        "subset_note",
        "Maintainer subset of IBTrACS.ALL.v04r01.nc for pipeline tests. "
        f"Storms: {', '.join(STORM_SIDS)}. Built 2026-11-17. "
        "Not a substitute for the full archive.",
    )

    for name in VARIABLES:
        svar = src.variables[name]
        kwargs = {"zlib": True, "complevel": 4}
        if "_FillValue" in svar.ncattrs():
            kwargs["fill_value"] = svar.getncattr("_FillValue")
        dvar = dst.createVariable(name, svar.dtype, svar.dimensions, **kwargs)
        for key in svar.ncattrs():
            if key != "_FillValue":
                dvar.setncattr(key, svar.getncattr(key))
        data = svar[:]
        dims = svar.dimensions
        if "storm" in dims:
            data = np.take(data, indices, axis=dims.index("storm"))
        if "date_time" in dims:
            data = np.take(data, np.arange(max_obs), axis=dims.index("date_time"))
        dvar[:] = data


def _quadrants(values):
    cells = [_cell(value) for value in values]
    if all(value is None for value in cells):
        return None
    return cells


def _extract(src, indices):
    import netCDF4 as nc

    sid = nc.chartostring(src.variables["sid"][:])
    name = nc.chartostring(src.variables["name"][:])
    track_type = nc.chartostring(src.variables["track_type"][:])
    iso_time = nc.chartostring(src.variables["iso_time"][:])
    basin = nc.chartostring(src.variables["basin"][:])
    nature = nc.chartostring(src.variables["nature"][:])
    usa_status = nc.chartostring(src.variables["usa_status"][:])
    usa_record = nc.chartostring(src.variables["usa_record"][:])
    usa_atcf_id = nc.chartostring(src.variables["usa_atcf_id"][:])
    storms = []
    for index in indices:
        obs = int(src.variables["numobs"][index])
        points = []
        for time_index in range(obs):
            points.append(
                {
                    "iso": _cell(iso_time[index, time_index]),
                    "lat": _cell(src.variables["lat"][index, time_index]),
                    "lon": _cell(src.variables["lon"][index, time_index]),
                    "usa_wind": _cell(src.variables["usa_wind"][index, time_index]),
                    "wmo_wind": _cell(src.variables["wmo_wind"][index, time_index]),
                    "usa_pres": _cell(src.variables["usa_pres"][index, time_index]),
                    "wmo_pres": _cell(src.variables["wmo_pres"][index, time_index]),
                    "landfall": _cell(src.variables["landfall"][index, time_index]),
                    "dist2land": _cell(src.variables["dist2land"][index, time_index]),
                    "usa_record": _cell(usa_record[index, time_index]) or "",
                    "usa_status": _cell(usa_status[index, time_index]) or "",
                    "nature": _cell(nature[index, time_index]) or "",
                    "basin": _cell(basin[index, time_index]) or "",
                    "atcf_id": _cell(usa_atcf_id[index, time_index]) or "",
                    "rmw": _cell(src.variables["usa_rmw"][index, time_index]),
                    "r34": _quadrants(src.variables["usa_r34"][index, time_index]),
                    "r50": _quadrants(src.variables["usa_r50"][index, time_index]),
                    "r64": _quadrants(src.variables["usa_r64"][index, time_index]),
                }
            )
        storms.append(
            {
                "sid": _cell(sid[index]),
                "name": _cell(name[index]) or "UNNAMED",
                "season": int(src.variables["season"][index]),
                "number": int(src.variables["number"][index]),
                "track_type": _cell(track_type[index]) or "",
                "points": points,
            }
        )
    return {
        "source": SOURCE.name,
        "source_sha256": _sha256(SOURCE),
        "built": "2026-11-17",
        "note": (
            "Source fields for the checked-in NetCDF fixture. "
            "Regenerate with maintain_ibtracs_fixture.py. Tests do not."
        ),
        "storms": storms,
    }


def main():
    import netCDF4 as nc

    if not SOURCE.is_file():
        sys.exit(f"IBTrACS source is not at {SOURCE}. Not downloading a replacement.")

    src = nc.Dataset(SOURCE)
    try:
        sids = [value.strip() for value in nc.chartostring(src.variables["sid"][:])]
        missing = [sid for sid in STORM_SIDS if sid not in sids]
        if missing:
            sys.exit(f"Source file has no storm id: {', '.join(missing)}")
        indices = [sids.index(sid) for sid in STORM_SIDS]
        max_obs = max(int(src.variables["numobs"][index]) for index in indices)
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        if FIXTURE.exists():
            FIXTURE.unlink()
        dst = nc.Dataset(FIXTURE, "w", format="NETCDF4")
        try:
            _subset(src, dst, indices, max_obs)
        finally:
            dst.close()
        extract = _extract(src, indices)
    finally:
        src.close()

    extract["fixture_sha256"] = _sha256(FIXTURE)
    extract["fixture_bytes"] = FIXTURE.stat().st_size
    SOURCE_EXTRACT.write_text(json.dumps(extract, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {FIXTURE} ({FIXTURE.stat().st_size} bytes)")
    print(f"Wrote {SOURCE_EXTRACT}")
    for storm in extract["storms"]:
        print(f"  {storm['sid']} {storm['name']} {storm['track_type']} season {storm['season']} points {len(storm['points'])}")
    if FIXTURE.stat().st_size >= 1_000_000:
        sys.exit("Fixture is not under 1MB. Stop.")


if __name__ == "__main__":
    main()
