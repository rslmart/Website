# makoa.link

A personal website hosting a small collection of interactive data-visualization
projects plus a resume. Each project is a self-contained page that fetches its
own pre-processed dataset at runtime and renders it with a mapping or charting
library.

Live at [makoa.link](https://makoa.link).

## Tech stack

- **React 18** + **react-router-dom 6** (client-side routing, one route per page)
- **Vite 6** for dev/build (via a Create-React-App compatibility shim in
  [`vite.config.js`](my-app/vite.config.js) — output goes to `build/`, not `dist/`)
- **deck.gl** + **react-map-gl / Mapbox GL** for the map pages (Hurricane, Tectonics)
- **Cytoscape.js** (+ dagre) for the RoyalTree genealogy graph
- **Recharts** for the Snow dashboard
- **Vitest** + **React Testing Library** (jsdom) and **MSW** for unit tests;
  **Playwright** (Chromium) for browser smoke tests
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
| `/Bio` | Resume / CV | none (static content) | [`my-app/src/Bio/README.md`](my-app/src/Bio/README.md) |
| `/Hurricane` | Cyclone tracks + satellite IR | NOAA IBTrACS, HURSAT-B1, RAMMB/CIRA | [`my-app/src/Hurricane/README.md`](my-app/src/Hurricane/README.md) |
| `/RoyalTree` | Royal family trees | Wikidata + Wikipedia + Wikimedia Commons | [`my-app/src/Royalty/README.md`](my-app/src/Royalty/README.md) |
| `/Snow` | WA mountain-pass snowfall | WSDOT + NOAA CPC ONI | [`my-app/src/Snow/README.md`](my-app/src/Snow/README.md) |
| `/Tectonics` | Plate boundaries | Bird (2002) PB2002 model | [`my-app/src/Tectonics/README.md`](my-app/src/Tectonics/README.md) |

Each per-page README explains **how and where that page's data was gathered and
processed**, the output schema, and how the frontend consumes it.

## Local development

Prerequisites: Node.js 18+ and npm. The app lives in the [`my-app/`](my-app)
subdirectory — run all commands from there:

```bash
cd my-app
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

## Testing

Tests run locally only (there is no CI). From `my-app/`:

```bash
npm test                        # unit + component tests (Vitest, ~1 s)
npm run test:watch              # same, re-running on change
npx playwright install chromium # once per machine, for the e2e suite
npm run test:e2e                # browser smoke tests (Playwright, ~15 s)
```

**Unit and component tests** (`npm test`) are `src/**/*.test.{js,jsx,mjs}`
files next to the code they test, run by Vitest in jsdom with
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
and jest-dom matchers. Configuration is in
[`vitest.config.js`](my-app/vitest.config.js), which reuses the app's Vite
config, and [`src/test/setup.js`](my-app/src/test/setup.js):

- **Offline:** an [MSW](https://mswjs.io/) server fails any test that makes a
  request to anything but localhost, even if the code swallows the error. Mock
  the responses a test needs with `server.use(http.get(url, () =>
  HttpResponse.json(...)))`, importing `server` from
  [`src/test/networkGuard.js`](my-app/src/test/networkGuard.js) and `http`
  and `HttpResponse` from `msw`. Handlers are reset after each test.
- **No Mapbox token:** `VITE_MAPBOX_TOKEN` is always empty in tests, so the
  map pages are tested in their no-token state.
- **Mocks:** mapbox-gl, react-map-gl, deck.gl and Cytoscape need WebGL or a
  canvas, so they are replaced by light DOM mocks in
  [`src/test/mocks/`](my-app/src/test/mocks/) (deck.gl's
  `WebMercatorViewport` keeps its real math). Recharts stays real except
  `ResponsiveContainer`, which gets a fixed 800 × 400 size. `ResizeObserver`
  and `matchMedia` are polyfilled. Real rendering is covered only by e2e.
- Pure-logic tests can opt out of jsdom with a `// @vitest-environment node`
  first line (see `src/Snow/snowStats.test.mjs`).
- **Known bugs** are written as `it.fails(...)` with the goal id in the name,
  so fixing the bug turns the test red and forces it to be updated.

**Browser smoke tests** (`npm run test:e2e`) live in
[`my-app/e2e/`](my-app/e2e/) and run Chromium with a desktop and a phone
project ([`playwright.config.js`](my-app/playwright.config.js)). Playwright
makes a production build into `build-e2e/` (never `build/`, so
`deploy.sh --skip-build` can't ship it) with `VITE_MAPBOX_TOKEN` forced empty,
then serves it with `vite preview` on port 4317 with `--strictPort`. Set
`PORT=...` to use another port, e.g. when two worktrees run e2e at once.
Import `test` and `expect` from `e2e/fixtures.js`: it aborts every request
that isn't to localhost (Google Fonts, map tiles) and lists them in the
`blockedRequests` fixture. Reports go to `playwright-report/` (open with
`npx playwright show-report`) and failure traces to `test-results/`.

## Theme

The site has a light and a dark theme in a green, gold, black and white
palette (approved 2026-11-17). Colours are CSS custom properties in
[`my-app/src/global.css`](my-app/src/global.css): `:root` holds the light
values and `:root[data-theme="dark"]` the dark ones, with `color-scheme` set
to match so native controls and scrollbars follow. Use the tokens instead of
hex values in page and component styles.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F4F5F2` | `#0B0B0B` | page background |
| `--color-surface` | `#FFFFFF` | `#161816` | cards, panels, modals, inputs |
| `--color-surface-translucent` | white 92% | `#161816` 92% | panels floating over maps |
| `--color-primary` | `#166534` | `#22A355` | links, primary buttons, focus ring, CTAs |
| `--color-primary-hover` | `#0F3D24` | `#4ADE80` | hover/pressed |
| `--color-primary-soft` | primary 12% | primary 14% | selected tint, focus halo |
| `--color-on-primary` | `#FFFFFF` | `#0B0B0B` | text on primary |
| `--color-accent` | `#D4A017` | `#E6B325` | gold rules and badges (decorative only on light) |
| `--color-accent-text` | `#8C6A0A` | `#E6B325` | gold-toned text |
| `--color-text` | `#111111` | `#FFFFFF` | body text, headings |
| `--color-text-muted` | `#4F554E` | `#B3B8B1` | secondary text |
| `--color-text-faint` | `#686E67` | `#8F958E` | tertiary text |
| `--color-danger` | `#B00020` | `#FF7A7A` | errors |
| `--color-border` | `#E1E4DE` | `#2A2E2A` | dividers, card borders |
| `--color-border-strong` | `#858B84` | `#6F756E` | control outlines (≥3:1) |
| `--color-chrome` / `-chrome-text` / `-chrome-accent` | `#0B0B0B` / white / `#D4A017` | `#000000` / white / `#E6B325` | black header/footer bars |
| `--color-tooltip-bg` / `-tooltip-text` | `#111111` / white | `#262A26` / white | tooltips |
| `--color-overlay` / `-overlay-soft` | black 55% / 45% | black 70% / 60% | modal and drawer scrims |
| `--shadow-sm` / `-panel` / `-raised` / `-modal` | black .12/.14/.22/.35 | black .5/.6/.65/.7 | elevation |
| `--chart-text` / `--chart-axis` | muted text / border-strong | muted text / border-strong | Recharts tick and axis labels, axis lines |
| `--chart-grid` | `#D5D9D2` | `#363B36` | Recharts grid lines |
| `--chart-reference` | `#555555` | `#8F958E` | reference marks (Snow "Average") |
| `--map-ink` | `#282828` | `#DADDD8` | map chrome drawn by deck.gl (Tectonics velocity arrows, line casing) |

Every text pair is ≥4.5:1 and every UI pair ≥3:1 in both themes.

**Charts and maps.** Recharts chrome (axes, grid, legend text, the default
tooltip) is themed by CSS rules at the end of `global.css`. Canvas and JS
consumers (deck.gl, Cytoscape, Recharts series props) read resolved tokens
with [`useThemeTokens`](my-app/src/hooks/useThemeTokens.js), which re-renders
on a theme change. Series, category and tree colours are data and stay with
the pages. Tectonics switches between Mapbox `light-v10` and `dark-v10` (v11
needs a newer mapbox-gl than 2.8.2); Hurricane's map stays `dark-v9` in both
themes, and only its panels follow the theme.

**Choosing the theme.** An inline script in
[`my-app/index.html`](my-app/index.html) sets `<html data-theme>` before
first paint, so there's no flash of the wrong theme: the saved choice
(`localStorage` key `theme`), else `prefers-color-scheme`. In React,
[`useTheme`](my-app/src/hooks/useTheme.js) (used by `RootLayout` in
`src/index.jsx`) follows system changes live and saves the choice made with
the theme menu ([`ThemeToggle`](my-app/src/components/ThemeToggle.jsx):
Light, Dark or System, where System removes the saved choice). The menu sits
top-right on Home and the 404 page, and beside the Home button, top-left, on
the data pages. If storage is blocked, the theme follows the system and the
menu still works for the visit. The script and the hook must agree:
`src/hooks/useTheme.test.jsx` checks the storage key and the light-only list.

**Light-only pages.** `LIGHT_ONLY_PATHS` (only Bio) stay light and hide the
menu until their own styles move onto the tokens. `<meta name="theme-color">`
is `#166534`, with `#0B0B0B` for `prefers-color-scheme: dark`; it follows the
OS, not the menu.

## Data & hosting model

The site is a static bundle plus a set of pre-processed data files. There are two
classes of data, both served from the same `makoa.link` bucket via CloudFront:

1. **In-repo, build-shipped data** — files under [`public/`](my-app/public) (the storm
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

Deploys are handled by [`deploy.sh`](my-app/deploy.sh) (run from `my-app/`).
Configure it once:

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
