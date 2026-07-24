# makoa.link

A personal website hosting a small collection of interactive data-visualization
projects plus a resume. Each project is a self-contained page that fetches its
own pre-processed dataset at runtime and renders it with a mapping or charting
library.

Live at [makoa.link](https://makoa.link).

## Tech stack

- **React 18** + **react-router-dom 6** (client-side routing, one route per page)
- **Vite 6** for dev/build (via a Create-React-App compatibility shim in
  [`vite.config.js`](vite.config.js) — output goes to `build/`, not `dist/`)
- **deck.gl** + **react-map-gl / Mapbox GL** for the map pages (Hurricane, Tectonics)
- **Cytoscape.js** (+ dagre) for the RoyalTree genealogy graph
- **Recharts** for the Snow dashboard
- Hosting: **AWS S3** (`makoa.link` bucket) behind **CloudFront**

## Project structure

```
my-app/
├── index.html                 # HTML shell (project root, not src/)
├── vite.config.js             # CRA-compat Vite config; builds to build/
├── deploy.sh                  # build → S3 sync → CloudFront invalidation
├── .env.example               # VITE_MAPBOX_TOKEN template → copy to .env.local
├── .env.deploy.example        # S3/CloudFront deploy config → copy to .env.deploy
├── public/                    # static assets served as-is (incl. processed data)
│   ├── hurricane/storms.json.gz
│   ├── royalty/*.json.gz, index.json, houses.json
│   ├── snow/pass_snowfall_data.json
│   └── tectonics/*.json.gz
└── src/
    ├── index.jsx              # router + global.css import
    ├── global.css             # design tokens, reset, shared UI primitives
    ├── index.css              # landing-page (Home) styles
    ├── Home.jsx               # landing card grid
    ├── components/            # shared HomeButton, HelpModal
    ├── Bio/                   # resume (static)          — see Bio/README.md
    ├── Hurricane/             # cyclone tracks + IR       — see Hurricane/README.md
    ├── Royalty/               # royal genealogies         — see Royalty/README.md
    ├── Snow/                  # WA snowfall dashboard      — see Snow/README.md
    └── Tectonics/             # plate boundaries          — see Tectonics/README.md
```

## Pages

| Route | Page | Data source | Details |
|-------|------|-------------|---------|
| `/` | Home | none (static landing) | this file |
| `/Bio` | Resume / CV | none (static content) | [`src/Bio/README.md`](src/Bio/README.md) |
| `/Hurricane` | Cyclone tracks + satellite IR | NOAA IBTrACS, HURSAT-B1, RAMMB/CIRA | [`src/Hurricane/README.md`](src/Hurricane/README.md) |
| `/RoyalTree` | Royal family trees | Wikidata + Wikipedia + Wikimedia Commons | [`src/Royalty/README.md`](src/Royalty/README.md) |
| `/Snow` | WA mountain-pass snowfall | WSDOT + NOAA CPC ONI | [`src/Snow/README.md`](src/Snow/README.md) |
| `/Tectonics` | Plate boundaries | Bird (2002) PB2002 model | [`src/Tectonics/README.md`](src/Tectonics/README.md) |

Each per-page README explains **how and where that page's data was gathered and
processed**, the output schema, and how the frontend consumes it.

## Local development

Prerequisites: Node.js 18+ and npm.

```bash
npm install

# The map pages need a Mapbox token:
cp .env.example .env.local
# then edit .env.local and set VITE_MAPBOX_TOKEN=<your public token>

npm run dev          # Vite dev server on http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build into build/
npm run preview      # preview the production build locally
npm run deploy       # build + deploy to S3/CloudFront (see below)
```

## Data & hosting model

The site is a static bundle plus a set of pre-processed data files. There are two
classes of data, both served from the same `makoa.link` bucket via CloudFront:

1. **In-repo, build-shipped data** — files under [`public/`](public) (the storm
   dataset, royalty trees, snowfall JSON, tectonic layers). These are committed to
   the repo and uploaded by `deploy.sh` as part of the normal build.
2. **Externally-managed data uploaded out-of-band** — large asset trees the build
   never touches:
   - `s3://makoa.link/hurricane-ir/…` — satellite IR frames (see Hurricane README)
   - `s3://makoa.link/monarchy/…` — monarch portraits (see Royalty README)
   - `s3://makoa.link/snow/pass_snowfall_data.json` — refreshed daily by a Lambda

   These are produced by the Python pipelines in each `*/Data/` folder and pushed
   straight to S3, independent of the site build.

Most processed datasets are stored **gzipped** (`*.json.gz`). The frontend fetches
the raw bytes, detects the gzip magic bytes (`0x1f 0x8b`), and decompresses in the
browser with `DecompressionStream("gzip")`, falling back to plain text if the
server already decompressed the response.

## Deployment

Deploys are handled by [`deploy.sh`](deploy.sh). Configure it once:

```bash
cp .env.deploy.example .env.deploy
# set S3_BUCKET=makoa.link and CLOUDFRONT_DISTRIBUTION_ID=… (plus optional AWS_PROFILE)
```

Then:

```bash
npm run deploy               # build, sync to S3, invalidate CloudFront
npm run deploy -- --dry-run  # preview what would change, no writes
```

The script uploads in tiers so caching stays correct without breaking the
externally-managed content:

| Content | Cache-Control | `--delete`? |
|---------|---------------|-------------|
| `build/assets/*` (content-hashed JS/CSS) | `max-age=31536000, immutable` | yes (scoped to `assets/`) |
| everything else at the root (favicons, `public/` data) | `max-age=3600` | **no** |
| `index.html` | `no-cache, no-store, must-revalidate` | n/a |

The root sync deliberately omits `--delete` so it never erases the out-of-band
content (`hurricane-ir/`, `monarchy/`, the Lambda-written snow JSON). A CloudFront
`/*` invalidation runs at the end.
