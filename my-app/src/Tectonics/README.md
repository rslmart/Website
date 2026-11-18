# Plate Tectonics (`/Tectonics`)

A world map of tectonic plates, their boundaries (colored by type), orogens, and
relative-motion velocity arrows. Built on deck.gl over a Mapbox basemap that
follows the site theme (`light-v10` or `dark-v10`).

- Page component: [`Tectonics.jsx`](Tectonics.jsx)
- Boundary color/label constants: [`constants.js`](constants.js)
- Build script: [`data/build.mjs`](data/build.mjs)
- Served layers: [`../../public/tectonics/`](../../public/tectonics)

## Data source

Everything derives from **Peter Bird's PB2002 plate model**: Bird, P. (2003),
*An updated digital model of plate boundaries*, Geochemistry, Geophysics,
Geosystems 4(3), 1027,
[doi:10.1029/2001GC000252](https://doi.org/10.1029/2001GC000252). The model is
named PB2002; the paper was published in 2003.

Rather than parsing Bird's original files from
[peterbird.name/oldFTP/PB2002](http://peterbird.name/oldFTP/PB2002/), the build
script pulls the GIS conversion by Hugo Ahlenius (Nordpil) at
[fraxen/tectonicplates](https://github.com/fraxen/tectonicplates), pinned to
commit `339b0c56563c118307b1f4542703047f5f698fae`:

| Layer | Source file |
|-------|-------------|
| Plates | `GeoJSON/PB2002_plates.json` |
| Boundary steps | `original/PB2002_steps.csv` |
| Orogens | `GeoJSON/PB2002_orogens.json` |

**Source version.** fraxen/tectonicplates has been frozen since that commit
(2014-10-06). `build.mjs` fetches the three files by hash. `public/tectonics/meta.json`
records the commit as `version`, the ODC-By licence, and `dataThrough`. The
steps file has no observation dates; `dataThrough` is `2003-03`, the month
Crossref gives for Bird (2003).

**Velocity frame.** `VELOCITYLE` is the "velocity of left plate with respect to
right plate" in mm/yr, and `VELOCITYAZ` its azimuth in degrees clockwise from
north (fraxen's `original/PB2002_steps_desc.txt`). It is a relative velocity
across the boundary, not a velocity in a fixed frame. The file doesn't define
left and right; the data fits left and right of the step looking from its start
to its end: on all 2,957 step features that diverge by more than 1 mm/yr
(`VELOCITYDI`), the velocity points to the left of the step.

**Licence and credit.** The fraxen data is under the
[Open Data Commons Attribution License (ODC-By) 1.0](https://opendatacommons.org/licenses/by/1-0/),
and fraxen asks that Hugo Ahlenius, Nordpil and Peter Bird be credited. The
legend panel carries that credit with links (ODC-By §4.3 requires a notice on
any public use of a produced work); keep it if the legend changes.

## How the data is processed

[`data/build.mjs`](data/build.mjs) fetches the three pinned files (about 920 KB)
and writes four gzipped outputs plus `meta.json` to `public/tectonics/`:

```bash
node src/Tectonics/data/build.mjs
```

Transformations:

- **Plates** → GeoJSON with just `{ Code, PlateName }`, coordinates rounded to 3
  decimals → `plates.json.gz`.
- **Orogens** → GeoJSON with `{ Name }`, rounded → `orogens.json.gz`.
- **Boundaries** → one feature per `SEQNUM` (5,819). A step that does not cross
  ±180 stays a 2-point LineString. A step that does is a MultiLineString split
  at ±180, with the latitude interpolated. The gzipped file is columnar
  (`seq0`, `stepClass`, `plateBound`, `velocity`, `azimuth`, `divergence`,
  `rightLateral`, `coordinates`). Row `i` is SEQNUM `seq0 + i`. The loader in
  `Tectonics.jsx` expands that back into a FeatureCollection. `divergence` is
  Bird's `VELOCITYDI` (convergence negative) and `rightLateral` is `VELOCITYRI`.
- **Velocity** → every 6th deduplicated step with speed > 0, placed at the
  step's start point and emitted as a plain array of
  `{ lon, lat, azimuthDeg, speed }` → `velocity.json.gz`.

### Steps and the antimeridian

Bird's model has **5,819** steps, one row each in `original/PB2002_steps.csv`.
Six of them cross ±180 (SEQNUM 1152, 1465, 1547, 2795, 4924, 4946). Each stays
one feature, split into two segments that meet at the meridian, so no segment
spans more than 180° of longitude. deck.gl's `wrapLongitude: true` still draws
the boundaries on every world copy.

The plate polygons also have ring edges along lon ±180° and the poles (18 edges)
that are not plate boundaries. The page fills plates without an outline, so
these edges are never drawn; the boundaries layer draws every real edge.

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

- On mount, `Tectonics.jsx` fetches all four `*.json.gz` files in parallel,
  decompresses them in-browser, and expands the columnar boundaries file.
- deck.gl layers render bottom-to-top: filled **plates** (clickable), **orogens**,
  **velocity** arrows (off by default), and **boundaries** colored by category
  (always on top).
- Velocity arrows are drawn as a shaft plus two barbs; length scales with speed,
  direction from the azimuth.
- The legend panel toggles boundary categories and overlay layers; clicking a
  plate opens an info panel with its name and code; hovering shows boundary type,
  the plate pair, and velocity.

The map requires `VITE_MAPBOX_TOKEN` (see the root README).

## Regenerating and checking the data

From `my-app/` (Node 18+, no npm packages needed; it downloads about 920 KB):

```bash
node src/Tectonics/data/build.mjs     # → public/tectonics/*.json.gz and meta.json
```

Check the output counts:

```bash
node -e 'const z=require("zlib"),fs=require("fs");
const L=(n)=>JSON.parse(z.gunzipSync(fs.readFileSync("public/tectonics/"+n)));
const b=L("boundaries.json.gz");
let wide=0;
for (const coords of b.coordinates) {
  const lines=Array.isArray(coords[0][0])?coords:[coords];
  for (const line of lines) for (let i=1;i<line.length;i++) if (Math.abs(line[i][0]-line[i-1][0])>180) wide++;
}
console.log({plates:L("plates.json.gz").features.length,
  orogens:L("orogens.json.gz").features.length, steps:b.stepClass.length,
  seq0:b.seq0, wide, velocity:L("velocity.json.gz").length,
  boundaryGzip:fs.statSync("public/tectonics/boundaries.json.gz").size})'
# { plates: 54, orogens: 13, steps: 5819, seq0: 1, wide: 0, velocity: 970, boundaryGzip: 87541 }
```

Then confirm the page with `npm run dev` and `npm run build`, and commit the
regenerated files. Publishing the site is a separate, owner-only step
(`deploy.sh`, see the root README); regenerating the data does not deploy it.
