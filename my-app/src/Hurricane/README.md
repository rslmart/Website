# Hurricane Explorer (`/Hurricane`)

An interactive map of global tropical-cyclone tracks with
per-storm satellite infrared imagery. Built on deck.gl over a Mapbox dark
basemap.

- Page component: [`Hurricane.jsx`](Hurricane.jsx)
- Storm detail + IR imagery: [`storm-info.jsx`](storm-info.jsx)
- Processed dataset: [`../../public/hurricane/storms.json.gz`](../../public/hurricane/storms.json.gz)
- Dataset metadata: [`../../public/hurricane/meta.json`](../../public/hurricane/meta.json) (`source`, `version`, `generatedAt`, `dataThrough`, `minSeason`, `maxSeason`, `latestTrackPoint`)

## Data sources

| Data | Source | Used for |
|------|--------|----------|
| Storm tracks | **NOAA IBTrACS v04r01** (International Best Track Archive for Climate Stewardship) | positions, wind, pressure, wind-radii for every track point |
| Historical IR (1978–2015) | **NOAA NCEI HURSAT-B1 v06** | pre-rendered infrared frames |
| Recent IR (2016+) | **RAMMB / CIRA TC Real-Time** | infrared frames pulled live |

Attribution links shown in the UI live in [`sources-panel.jsx`](sources-panel.jsx).
IBTrACS is the sole track source.

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
# → ../../../public/hurricane/storms.json.gz
# → ../../../public/hurricane/meta.json  (season range and data-through date)
```

What the converter does:

1. Bulk-reads the NetCDF variables (lat/lon, `iso_time`, `usa_wind`/`wmo_wind`,
   `usa_pres`/`wmo_pres`, the 34/50/64 kt wind radii, `usa_rmw`, and metadata).
2. Walks each storm's track points, coalescing US-agency values with WMO
   fallbacks, normalizing status codes, and flagging coastline crossings.
3. Computes **wind-field polygons** from the quadrant radii (NE/SE/SW/NW) and a
   **max-wind-radius diamond** from `usa_rmw`, using `geopy` for nautical-mile
   geodesics.
4. Aggregates per-storm peak wind, minimum pressure, status list, track type,
   and the US ATCF id (used later to build RAMMB image URLs).
5. Writes a compact JSON object keyed by IBTrACS storm id, gzipped at level 9.
6. Writes `meta.json` beside it. `dataThrough` is the date of the latest
   track point. `minSeason` and `maxSeason` are the seasons in the file.
   The page uses those for the default year filter and the year-input maximum,
   and the Sources panel shows `dataThrough`.

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
    "max_wind": 150,               // kt; null when the storm reported no wind
    "min_pressure": 902,           // mb (optional)
    "track_type": "main",          // IBTrACS: main, spur-*, PROVISIONAL, …
    "status_list": ["HU", "TS"],
    "record_type_list": ["L"],     // "L" = sea-to-land crossing
    "atcf_id": "AL122005",         // optional; drives RAMMB imagery
    "track_points": [
      {
        "id": "2005236N23285",
        "date_time": "2005-08-25 18:00:00",
        "year": 2005, "month": 8, "hours": 18, "minutes": 0,
        "latitude": 26.1, "longitude": -80.4,
        "wind": 70, "wind_source": "usa", "pressure": 984,
        "status": "HU", "record_type": "L",
        "max_wind_radius": 15,                 // nm (optional)
        "max_wind_poly": [[lon,lat], ...],     // optional
        "64_ne_poly": [[lon,lat], ...]         // 34/50/64 kt × NE/SE/SW/NW (optional)
      }
    ]
  }
}
```

`record_type` `"L"` is a coastline crossing: the USA record is `L`, or
`landfall == 0` while `dist2land > 0`. A point already over land
(`landfall == 0` and `dist2land == 0`) is not marked `L`.

`wind` is the USA 1-minute value when that cell is present, otherwise the WMO
value. `wind_source` is `"usa"` or `"wmo"`. WMO winds keep the reporting
agency's averaging period, often 10 minutes (BoM, Réunion, Wellington, New
Delhi). A point with neither source has `wind: null` and no `wind_source`.
`max_wind` is the peak reported wind, or null when the storm has none. A
reported 0 stays 0.

`track_type` is copied from IBTrACS. Values containing `spur`
(`spur-merge`, `spur-split`, `spur-other`, `*_spur`) duplicate another track.
Heatmap, Grid, Max Wind Grid, and Scatter drop those points. Storm view shows
them only while **Show spur tracks** is on. `provisional: true` is set when
`track_type` contains `PROVISIONAL`, and the storm panel appends
"Provisional" to the name.

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

- On mount, `Hurricane.jsx` fetches `storms.json.gz` and `meta.json`. It
  decompresses the storm file in-browser and keeps it out of the JS bundle.
  The default year range and the year-input maximum come from `minSeason` and
  `maxSeason`. The Sources panel shows `dataThrough`, the latest track-point date.
- Five plot modes render via deck.gl: **Storm** (tracks + points + optional wind
  polygons), **Scatter**, **Heatmap**, **Grid** (point counts per cell), and
  **Max Wind Grid** (max wind per cell).
- Points and tracks are colored by the **Saffir–Simpson** scale. The same
  bins are drawn on the map (`category-legend.jsx`) and in
  [`help-panel.jsx`](help-panel.jsx). A point with `wind: null` is gray and
  is not on that scale. It also fails the wind-range filter, so it stays out
  of Scatter, Heatmap, Grid, and Max Wind Grid.
- Filters cover basin, year, month, wind/pressure range, and status.
  Scatter mode can keep only the 6-hour fixes. Storm view has a **Show spur tracks** toggle, off by
  default.
- Selecting a point opens a wind/pressure chart plus the IR frame described above.

The map requires `VITE_MAPBOX_TOKEN` (see the root README).

### Map style

The basemap is `mapbox://styles/mapbox/dark-v9` (`MAP_STYLE` in `Hurricane.jsx`)
in both site themes; only the panels, drawers and tooltips follow the theme
(user ruling, 2026-11-17). It stays on v9: the Saffir–Simpson colours were
chosen against it, and the v11 styles need a newer mapbox-gl than the 2.8.2 the
site uses (v11's fog/globe properties are rejected; see `MAP_STYLES` in
`src/Tectonics/Tectonics.jsx`).

## Refreshing the track data

This refresh is manual. There is no script and no schedule.

1. Download `IBTrACS.ALL.v04r01.nc` from NCEI into `src/Hurricane/` (the file is gitignored):

   https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/netcdf/IBTrACS.ALL.v04r01.nc

2. Run the converter:

   ```bash
   cd src/Hurricane/data
   uv run --with netCDF4 --with numpy --with geopy python convertIbtracsToJson.py
   ```

   That rewrites `public/hurricane/storms.json.gz` and `public/hurricane/meta.json`.

3. Run the checks from `my-app/`:

   ```bash
   bash test-pipelines.sh
   ```

4. Hand `public/hurricane/` (`storms.json.gz` and `meta.json`) to the Conductor. Publishing it is a separate, user-approved deploy. This procedure does not deploy.

HURSAT imagery is a different batch job (`data/buildHursatImages.py`, above). It is not part of this track refresh.

## Tests

Pipeline tests are local and offline. From `my-app/`:

```bash
./test-pipelines.sh
```

That installs the locked environment in [`../pipeline_testing`](../pipeline_testing)
(`uv.lock`, Python 3.11) and runs the Hurricane and Snow suites. Hurricane only:

```bash
uv run --directory src/pipeline_testing --frozen \
  pytest --rootdir "$PWD/src/Hurricane" "$PWD/src/Hurricane/tests"
```

Direct pins are in [`requirements-dev.txt`](requirements-dev.txt) (pytest 9.2.0,
pytest-socket 0.8.1, moto 5.2.5 with the `s3` extra). Transitive pins, including
boto3, are in the lock. Runtime libraries stay on the `uv run --with` commands
above.

`pytest-socket` blocks Python sockets, including DNS. AWS credential files are
set to `/dev/null`, credential environment variables are removed, and EC2
instance metadata is disabled. S3 tests take the `moto_s3` fixture; its dummy
`testing` keys exist only inside that fixture, and the credential files stay
on `/dev/null`. `make_s3_client` still requests the `makoa` profile, which
cannot load under that setting, so a test that calls it has to patch
`make_s3_client`. pytest-socket does not see a `curl` subprocess; patch the
download helper instead of letting it run.
