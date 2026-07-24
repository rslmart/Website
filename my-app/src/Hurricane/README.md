# Hurricane Explorer (`/Hurricane`)

An interactive map of global tropical-cyclone tracks (1842–present) with
per-storm satellite infrared imagery. Built on deck.gl over a Mapbox dark
basemap.

- Page component: [`Hurricane.jsx`](Hurricane.jsx)
- Storm detail + IR imagery: [`storm-info.jsx`](storm-info.jsx)
- Processed dataset: [`../../public/hurricane/storms.json.gz`](../../public/hurricane/storms.json.gz)

## Data sources

| Data | Source | Used for |
|------|--------|----------|
| Storm tracks | **NOAA IBTrACS v04r01** (International Best Track Archive for Climate Stewardship) | positions, wind, pressure, wind-radii for every track point |
| Historical IR (1978–2015) | **NOAA NCEI HURSAT-B1 v06** | pre-rendered infrared frames |
| Recent IR (2016+) | **RAMMB / CIRA TC Real-Time** | infrared frames pulled live |

Attribution links shown in the UI live in [`sources-panel.jsx`](sources-panel.jsx).

> Legacy HURDAT scrapers (`data/convertHurdatToJson.py`, `data/scraper/`, etc.)
> remain in the repo from earlier iterations but are **not** used by the live
> page. IBTrACS is the sole track source today.

## How the track data is gathered and processed

The raw dataset is a single global NetCDF file, **`IBTrACS.ALL.v04r01.nc`**,
downloaded from NCEI:

```
https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/netcdf/
```

It is ~23 MB and gitignored; place it in `src/Hurricane/`. The converter
[`data/convertIbtracsToJson.py`](data/convertIbtracsToJson.py) turns it into the
gzipped JSON the site serves:

```bash
cd src/Hurricane/data
uv run --with netCDF4 --with numpy --with geopy python convertIbtracsToJson.py
# → ../../../public/hurricane/storms.json.gz  (~13,500 storms, 1842–2026)
```

What the converter does:

1. Bulk-reads the NetCDF variables (lat/lon, `iso_time`, `usa_wind`/`wmo_wind`,
   `usa_pres`/`wmo_pres`, the 34/50/64 kt wind radii, `usa_rmw`, and metadata).
2. Walks each storm's track points, coalescing US-agency values with WMO
   fallbacks, normalizing status codes, and flagging landfalls.
3. Computes **wind-field polygons** from the quadrant radii (NE/SE/SW/NW) and a
   **max-wind-radius diamond** from `usa_rmw`, using `geopy` for nautical-mile
   geodesics.
4. Aggregates per-storm peak wind, minimum pressure, status list, and the US
   ATCF id (used later to build RAMMB image URLs).
5. Writes a compact JSON object keyed by IBTrACS storm id, gzipped at level 9.

### Output schema (`storms.json.gz`)

Top level is an object keyed by IBTrACS storm id (e.g. `2005236N23285`):

```jsonc
{
  "<sid>": {
    "name": "KATRINA",
    "basin": "NA",
    "number": 12,
    "season": 2005,
    "id": "2005236N23285",
    "max_wind": 150,               // kt
    "min_pressure": 902,           // mb (optional)
    "status_list": ["HU", "TS"],
    "record_type_list": ["L"],     // "L" = landfall
    "atcf_id": "AL122005",         // optional; drives RAMMB imagery
    "track_points": [
      {
        "id": "2005236N23285",
        "date_time": "2005-08-25 18:00:00",
        "year": 2005, "month": 8, "hours": 18, "minutes": 0,
        "latitude": 26.1, "longitude": -80.4,
        "wind": 70, "pressure": 984, "status": "HU", "record_type": "L",
        "max_wind_radius": 15,                 // nm (optional)
        "max_wind_poly": [[lon,lat], ...],     // optional
        "64_ne_poly": [[lon,lat], ...]         // 34/50/64 kt × NE/SE/SW/NW (optional)
      }
    ]
  }
}
```

## How the satellite imagery is produced

The page shows one IR frame per selected track point. There are two eras, split
at the **2016 season**:

- **1978–2015 → HURSAT-B1**, pre-rendered and hosted on our own bucket.
- **2016+ → RAMMB/CIRA**, fetched live from Colorado State.

### HURSAT-B1 (`data/buildHursatImages.py`)

For storms that were **Category 3+ (≥ 96 kt) or made landfall**, this script:

1. Downloads the per-storm HURSAT-B1 tarball from NCEI
   (`https://www.ncei.noaa.gov/data/hurricane-satellite-hursat-b1/archive/v06/{year}/`).
2. Picks the lowest view-zenith-angle NetCDF file per synoptic time.
3. Renders the `IRWIN` window-IR channel with the matplotlib `turbo_r` colormap
   (190–300 K) to a JPEG.
4. Uploads to `s3://makoa.link/hurricane-ir/{sid}/{YYYYMMDDHHMM}.jpg` with a
   1-year immutable cache header.

[`data/hursat_manifest.json`](data/hursat_manifest.json) is a server-side resume
log for this batch job only — the frontend never reads it. The site reconstructs
the same S3 key pattern on the fly.

### RAMMB/CIRA (live)

For 2016+ storms, [`storm-info.jsx`](storm-info.jsx) derives the RAMMB storm id
from `atcf_id` (e.g. `AL052019` → `2019al05`) and builds URLs under
`https://rammb-data.cira.colostate.edu/tc_realtime/`. Nothing is stored locally.

In both cases the component tries a series of nearby timestamps and falls back to
the next candidate on image load error.

## How the frontend uses it

- On mount, `Hurricane.jsx` fetches `storms.json.gz`, decompresses it in-browser,
  and keeps it out of the JS bundle.
- Five plot modes render via deck.gl: **Storm** (tracks + points + optional wind
  polygons), **Scatter**, **Heatmap**, **Grid** (point counts per cell), and
  **Max Wind Grid** (max wind per cell).
- Points and tracks are colored by the **Saffir–Simpson** scale (see
  [`help-panel.jsx`](help-panel.jsx)).
- Filters cover basin, year, month, wind/pressure range, status, landfall, and
  6-hourly sampling.
- Selecting a point opens a wind/pressure chart plus the IR frame described above.

The map requires `VITE_MAPBOX_TOKEN` (see the root README).

## Regenerating the data

```bash
# 1. Download IBTrACS.ALL.v04r01.nc into src/Hurricane/
# 2. Rebuild the served dataset:
cd src/Hurricane/data
uv run --with netCDF4 --with numpy --with geopy python convertIbtracsToJson.py
# 3. (optional) Rebuild HURSAT imagery (needs AWS profile "makoa"):
uv run --with boto3 --with netCDF4 --with numpy --with pillow --with matplotlib \
    python buildHursatImages.py
# 4. Deploy the site (uploads storms.json.gz; leaves hurricane-ir/ untouched):
cd ../../.. && npm run deploy
```
