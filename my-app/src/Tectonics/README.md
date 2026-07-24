# Plate Tectonics (`/Tectonics`)

A world map of tectonic plates, their boundaries (colored by type), orogens, and
relative-motion velocity arrows. Built on deck.gl over a Mapbox light basemap.

- Page component: [`Tectonics.jsx`](Tectonics.jsx)
- Boundary color/label constants: [`constants.js`](constants.js)
- Build script: [`data/build.mjs`](data/build.mjs)
- Served layers: [`../../public/tectonics/`](../../public/tectonics)

## Data source

Everything derives from **Peter Bird's PB2002 plate model** — *An updated digital
model of plate boundaries*, Bird (2003), G-Cubed
([doi:10.1029/2001GC000252](https://doi.org/10.1029/2001GC000252)), commonly
cited as "Bird 2002."

Rather than parsing Bird's original GMT/`.dig` supplement files, the build script
pulls the community-maintained GeoJSON conversion from
[fraxen/tectonicplates](https://github.com/fraxen/tectonicplates):

| Layer | Source file |
|-------|-------------|
| Plates | `GeoJSON/PB2002_plates.json` |
| Boundary steps | `GeoJSON/PB2002_steps.json` |
| Orogens | `GeoJSON/PB2002_orogens.json` |

Velocities in the step records are in the PB2002 Africa-fixed reference frame
(`VELOCITYLE` in mm/yr, `VELOCITYAZ` azimuth).

## How the data is processed

[`data/build.mjs`](data/build.mjs) fetches the three GeoJSON files and writes four
gzipped outputs to `public/tectonics/`:

```bash
node src/Tectonics/data/build.mjs
```

Transformations:

- **Plates** → GeoJSON with just `{ Code, PlateName }`, coordinates rounded to 3
  decimals → `plates.json.gz`.
- **Orogens** → GeoJSON with `{ Name }`, rounded → `orogens.json.gz`.
- **Boundaries** → each PB2002 *step* becomes a 2-point LineString
  (start → finish) carrying `{ stepClass, plateBound, velocity, azimuth }` →
  `boundaries.json.gz`.
- **Velocity** → every 6th step with speed > 0, emitted as a plain array of
  `{ lon, lat, azimuthDeg, speed }` → `velocity.json.gz`.

### Boundary classification

Bird's `STEPCLASS` codes are mapped to four display categories in
[`constants.js`](constants.js):

| STEPCLASS | Category | Meaning |
|-----------|----------|---------|
| `CCB`, `OCB` | Convergent | continental / oceanic convergent boundary |
| `CRB`, `OSR` | Ridge | continental rift / oceanic spreading ridge |
| `CTF`, `OTF` | Transform | continental / oceanic transform fault |
| `SUB` | Subduction | subduction zone |

`categoryForStepClass()` and `colorForStepClass()` resolve the category and RGB
color (unknown classes fall back to grey).

## How the frontend uses it

- On mount, `Tectonics.jsx` fetches all four `*.json.gz` files in parallel and
  decompresses them in-browser.
- deck.gl layers render bottom-to-top: filled **plates** (clickable), **orogens**,
  **velocity** arrows (off by default), and **boundaries** colored by category
  (always on top).
- Velocity arrows are drawn as a shaft plus two barbs; length scales with speed,
  direction from the azimuth.
- The legend panel toggles boundary categories and overlay layers; clicking a
  plate opens an info panel with its name and code; hovering shows boundary type,
  the plate pair, and velocity.

The map requires `VITE_MAPBOX_TOKEN` (see the root README).

## Regenerating the data

```bash
node src/Tectonics/data/build.mjs     # → public/tectonics/*.json.gz
npm run deploy                        # ship it
```
