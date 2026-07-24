# WA Snowfall (`/Snow`)

A dashboard comparing snowfall across Washington State mountain passes by season,
with El Niño / La Niña (ENSO) context. Rendered with Recharts.

- Page component: [`SnowPage.jsx`](SnowPage.jsx)
- Bulk fetch script: [`Data/getData.py`](Data/getData.py)
- Daily updater (Lambda): [`lambda/`](lambda) — see [`lambda/README.md`](lambda/README.md)
- Served data: [`../../public/snow/pass_snowfall_data.json`](../../public/snow/pass_snowfall_data.json)

## Data sources

| Data | Source | Ingested by |
|------|--------|-------------|
| Daily snow depth / new & accumulated snowfall | **WSDOT** Real-time Mountain Pass API (JSON) | `Data/getData.py` (history) + `lambda/handler.py` (daily) |
| ENSO / ONI winter anomaly | **NOAA CPC** Oceanic Niño Index | hand-curated into `Data/oni.json` |

Passes tracked (WSDOT `MountainPassId`): Blewett US-97 (1), Sherman SR-20 (9),
Stevens US-2 (10), Snoqualmie I-90 (11), White US-12 (12).

## How the snowfall data is gathered and processed

Both ingest paths call the same WSDOT JSON endpoint (no HTML scraping):

```
https://wsdot.com/Travel/Real-time/Service/api/MountainPass/SnowFallData?MountainPassId={id}&Year={year}
```

`Year` is the **season start year** (e.g. `2025` covers Oct 2025 → May 2026).

- **Historical backfill** — [`Data/getData.py`](Data/getData.py) fetches every
  season from each pass's first year of record (Snoqualmie back to 1999, others
  2004–2005) and pretty-prints the combined result to
  `public/snow/pass_snowfall_data.json`. The script stores WSDOT's response shape
  more or less verbatim; all chart math happens in the frontend.
- **Daily in-season refresh** — the AWS Lambda in [`lambda/`](lambda) runs once a
  day (EventBridge cron, ~7–8am Pacific). It reads the current JSON from S3,
  fetches the active season for all five passes, merges it in, writes back to
  `s3://<bucket>/snow/pass_snowfall_data.json`, and issues a CloudFront
  invalidation so the update is visible immediately. Deploy/ops details are in
  [`lambda/README.md`](lambda/README.md).

### Schema (`pass_snowfall_data.json`)

```jsonc
{
  "<PassKey>": {                         // e.g. "Stevens_Pass_US-2"
    "<SeasonStartYear>": [               // e.g. "2025"
      {
        "month": "Nov", "monthNum": 11, "year": 2025, "displayOrder": 1,
        "avgNewSnowfallInches": 0.73, "avgTotalSnowfallInches": 3,
        "dailySnowFall": [
          {
            "day": 3,
            "newDailySnowFall": 0.0,     // new snow that day (in)
            "totalSnowFall": 4,          // snow depth on ground (in)
            "accumulatedSnowFall": 0     // season-to-date snowfall (in)
          }
        ]
      }
    ]
  }
}
```

WSDOT returns **sparse** records — only days/months with measurements appear.

## How the ENSO data is gathered and processed

[`Data/oni.json`](Data/oni.json) maps each snowfall season start year to that
winter's **DJF (Dec–Jan–Feb) ONI anomaly** in °C, taken from NOAA CPC:

```
https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
```

There's no generator script — it's a small hand-maintained file, updated roughly
once a year. Note the year alignment: the DJF row NOAA labels year `Y` covers the
winter that *starts* in `Y-1`, so snowfall season `S` uses NOAA's `DJF (S+1)` row.

```jsonc
{ "1999": -1.66, "2000": -0.68, ..., "2025": -0.37 }   // season → DJF anomaly (°C)
```

The frontend classifies each value into a phase (`SnowPage.jsx`):
El Niño ≥ +0.5, La Niña ≤ −0.5, else Neutral; strength (weak/moderate/strong/
very strong) by magnitude at 0.5 / 1.0 / 1.5 / 2.0.

## How the frontend uses it

- `SnowPage.jsx` fetches `pass_snowfall_data.json` at runtime; `oni.json` is
  bundled at build time (`import oni from './Data/oni.json'`).
- Pass and season selectors drive three Recharts panels: **Snow Depth**
  (`totalSnowFall`), **Accumulated Snowfall** (`accumulatedSnowFall`), and
  **New Daily Snowfall** (`newDailySnowFall`).
- For each pass it computes client-side baselines across seasons — an all-season
  Average plus separate La Niña and El Niño averages — and auto-selects the
  highest- and lowest-snowfall seasons for comparison lines.
- A badge shows the current winter's ENSO status, colored by phase.

## Adding a new season

```bash
# Snowfall: bump the latest season in Data/getData.py, re-run it, and copy the
# output to public/snow/pass_snowfall_data.json (the Lambda then keeps the active
# season current day-to-day).
cd src/Snow/Data && python getData.py

# ENSO: add the new DJF anomaly to Data/oni.json (NOAA row DJF (season+1)),
# keyed by the season start year.

# then redeploy the site:
npm run deploy
```
