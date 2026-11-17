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
[fraxen/tectonicplates](https://github.com/fraxen/tectonicplates), using its
`GeoJSON/` files:

| Layer | Source file |
|-------|-------------|
| Plates | `GeoJSON/PB2002_plates.json` |
| Boundary steps | `GeoJSON/PB2002_steps.json` |
| Orogens | `GeoJSON/PB2002_orogens.json` |

**Source version.** fraxen/tectonicplates has been frozen since commit
[`339b0c5`](https://github.com/fraxen/tectonicplates/tree/339b0c56563c118307b1f4542703047f5f698fae)
(2014-10-06), and the committed `public/tectonics/` data was built from it.
`build.mjs` still fetches the `master` branch, so before regenerating, confirm
`master` is still at that commit:

```bash
git ls-remote https://github.com/fraxen/tectonicplates refs/heads/master
# 339b0c56563c118307b1f4542703047f5f698fae	refs/heads/master
```

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

[`data/build.mjs`](data/build.mjs) fetches the three GeoJSON files and writes four
gzipped outputs to `public/tectonics/`:

```bash
node src/Tectonics/data/build.mjs
```

Transformations:

- **Plates** → GeoJSON with just `{ Code, PlateName }`, coordinates rounded to 3
  decimals → `plates.json.gz`.
- **Orogens** → GeoJSON with `{ Name }`, rounded → `orogens.json.gz`.
- **Boundaries** → each step feature becomes a 2-point LineString
  (`STARTLONG/STARTLAT` → `FINALLONG/FINALLAT`) carrying
  `{ stepClass, plateBound, velocity, azimuth }` → `boundaries.json.gz`.
- **Velocity** → every 6th step feature with speed > 0, placed at the step's
  start point and emitted as a plain array of `{ lon, lat, azimuthDeg, speed }`
  → `velocity.json.gz`.

### Steps and the antimeridian (5,819 versus 5,824)

Bird's model has **5,819** steps (`original/PB2002_steps.csv`). fraxen split
steps that cross ±180° by hand, so `GeoJSON/PB2002_steps.json` has **5,824**
features, and so does `boundaries.json.gz`. The build does no antimeridian
handling of its own: it rebuilds every feature from the step's full start and
end points, so

- 5 crossing steps appear **twice** (identical features), and
- **11** features have endpoints about 359.5° apart in longitude (the 10
  duplicates plus KE-AU, of which fraxen kept one half).

deck.gl's `wrapLongitude: true` draws these the short way across ±180°, so the
page shows no world-spanning lines, but the 5 duplicated steps are drawn and
picked twice. Any consumer without that option would draw 11 lines across the
whole map.

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

## Regenerating and checking the data

From `my-app/` (Node 18+, no npm packages needed; it downloads about 10.7 MB):

```bash
node src/Tectonics/data/build.mjs     # → public/tectonics/*.json.gz
```

Check the output counts:

```bash
node -e 'const z=require("zlib"),fs=require("fs");
const L=(n)=>JSON.parse(z.gunzipSync(fs.readFileSync("public/tectonics/"+n)));
const b=L("boundaries.json.gz").features;
console.log({plates:L("plates.json.gz").features.length,
  orogens:L("orogens.json.gz").features.length, boundaryFeatures:b.length,
  steps:new Set(b.map((f)=>JSON.stringify([f.geometry,f.properties]))).size,
  antimeridian:b.filter((f)=>Math.abs(f.geometry.coordinates[0][0]-f.geometry.coordinates[1][0])>180).length,
  velocity:L("velocity.json.gz").length})'
# { plates: 54, orogens: 13, boundaryFeatures: 5824, steps: 5819, antimeridian: 11, velocity: 971 }
```

Then confirm the page with `npm run dev` and `npm run build`, and commit the
regenerated files. Publishing the site is a separate, owner-only step
(`deploy.sh`, see the root README); regenerating the data does not deploy it.
