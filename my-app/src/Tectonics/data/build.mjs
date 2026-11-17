// Downloads the Peter Bird PB2002 plate model (Bird 2003, G-Cubed 4(3) 1027,
// doi:10.1029/2001GC000252) as converted by Hugo Ahlenius, Nordpil
// (fraxen/tectonicplates, ODC-By 1.0; the app's legend carries the credit) and
// produces trimmed, gzipped GeoJSON for the /Tectonics page.
//
//   node src/Tectonics/data/build.mjs
//
// Importing this module does not download or write. That happens only when
// the file is the node entry point. A normal run leaves
// TECTONICS_BUILD_OFFLINE unset and writes the same four files. Tests set
// that variable to 1, with TECTONICS_PB2002_FIXTURE and TECTONICS_OUT_DIR,
// to build a local fixture into a temporary directory.
//
// Source: the `master` branch, which has been frozen at commit
// 339b0c56563c118307b1f4542703047f5f698fae (2014-10-06); the committed data was
// built from it. See README.md for how to confirm that and check the output.
//
// Outputs (gzipped) into my-app/public/tectonics/:
//   - plates.json.gz      54 polygons with { Code, PlateName }
//   - boundaries.json.gz  5,824 two-point step segments with
//                         { stepClass, plateBound, velocity, azimuth }
//   - orogens.json.gz     13 orogeny polygons
//   - velocity.json.gz    971 sampled arrow points { lon, lat, azimuthDeg, speed }
//
// STEPCLASS is Bird's boundary-type code (SUB, OSR, OTF, CRB, CTF, CCB, OCB).
// VELOCITYLE/VELOCITYAZ are the velocity of the left plate relative to the
// right plate across each step (mm/yr, azimuth clockwise from north), not a
// fixed-frame velocity.
//
// Antimeridian: this script does no handling of its own. Bird has 5,819 steps;
// fraxen split the steps crossing ±180° by hand, giving 5,824 features. Each
// feature is rebuilt from its step's full start and end points, so 5 steps are
// written twice and 11 segments span about 359.5° of longitude. The page draws
// them the short way with deck.gl's `wrapLongitude`.

import {gzipSync} from 'node:zlib';
import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAW = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON';
const SOURCES = {
    plates: `${RAW}/PB2002_plates.json`,
    steps: `${RAW}/PB2002_steps.json`,
    orogens: `${RAW}/PB2002_orogens.json`,
};

// Keep every Nth step as a velocity arrow so the map is not overwhelmed.
const VELOCITY_SAMPLE = 6;
const COORD_PRECISION = 3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../public/tectonics');

const round = (n) => Number(n.toFixed(COORD_PRECISION));
const roundPair = ([lon, lat]) => [round(lon), round(lat)];

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    return res.json();
}

function writeGzip(outDir, name, obj) {
    const json = JSON.stringify(obj);
    const gz = gzipSync(Buffer.from(json), {level: 9});
    const path = resolve(outDir, name);
    writeFileSync(path, gz);
    console.log(`  ${name}: ${(json.length / 1e6).toFixed(2)}MB -> ${(gz.length / 1e6).toFixed(2)}MB gz`);
}

export function buildPlates(raw) {
    return {
        type: 'FeatureCollection',
        features: raw.features.map((f) => ({
            type: 'Feature',
            properties: {Code: f.properties.Code, PlateName: f.properties.PlateName},
            geometry: roundGeometry(f.geometry),
        })),
    };
}

export function buildOrogens(raw) {
    return {
        type: 'FeatureCollection',
        features: raw.features.map((f) => ({
            type: 'Feature',
            properties: {Name: f.properties.Name ?? f.properties.name ?? ''},
            geometry: roundGeometry(f.geometry),
        })),
    };
}

// Each step becomes a 2-point segment (start -> final). Steps are short and
// contiguous, so the boundary reads as a continuous colored line while the
// payload stays small.
export function buildBoundaries(rawSteps) {
    const features = rawSteps.features.map((f) => {
        const p = f.properties;
        return {
            type: 'Feature',
            properties: {
                stepClass: p.STEPCLASS,
                plateBound: p.PLATEBOUND,
                velocity: round(p.VELOCITYLE),
                azimuth: round(p.VELOCITYAZ),
            },
            geometry: {
                type: 'LineString',
                coordinates: [
                    [round(p.STARTLONG), round(p.STARTLAT)],
                    [round(p.FINALLONG), round(p.FINALLAT)],
                ],
            },
        };
    });
    return {type: 'FeatureCollection', features};
}

export function buildVelocity(rawSteps) {
    const points = [];
    rawSteps.features.forEach((f, i) => {
        if (i % VELOCITY_SAMPLE !== 0) return;
        const p = f.properties;
        if (!p.VELOCITYLE || p.VELOCITYLE <= 0) return;
        points.push({
            lon: round(p.STARTLONG),
            lat: round(p.STARTLAT),
            azimuthDeg: round(p.VELOCITYAZ),
            speed: round(p.VELOCITYLE),
        });
    });
    return points;
}

function roundGeometry(geometry) {
    const roundRing = (ring) => ring.map(roundPair);
    if (geometry.type === 'Polygon') {
        return {type: 'Polygon', coordinates: geometry.coordinates.map(roundRing)};
    }
    if (geometry.type === 'MultiPolygon') {
        return {
            type: 'MultiPolygon',
            coordinates: geometry.coordinates.map((poly) => poly.map(roundRing)),
        };
    }
    if (geometry.type === 'LineString') {
        return {type: 'LineString', coordinates: roundRing(geometry.coordinates)};
    }
    if (geometry.type === 'MultiLineString') {
        return {type: 'MultiLineString', coordinates: geometry.coordinates.map(roundRing)};
    }
    return geometry;
}

// True when node was started with this file as the program. Importing the
// module (Vitest, or another script) leaves the entry point as that other file.
export function invokedAsProgram(entry = process.argv[1], moduleUrl = import.meta.url) {
    if (!entry) return false;
    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
    } catch {
        return false;
    }
}

// Test-only. Unset on a normal run, so main() downloads the three source URLs
// and writes OUT_DIR exactly as before.
function offlineInput() {
    if (process.env.TECTONICS_BUILD_OFFLINE !== '1') return null;
    const fixturePath = process.env.TECTONICS_PB2002_FIXTURE;
    const outDir = process.env.TECTONICS_OUT_DIR;
    if (!fixturePath || !outDir) {
        throw new Error(
            'TECTONICS_BUILD_OFFLINE=1 requires TECTONICS_PB2002_FIXTURE and TECTONICS_OUT_DIR',
        );
    }
    return {outDir, input: JSON.parse(readFileSync(fixturePath, 'utf8'))};
}

export async function main(options = {}) {
    const outDir = options.outDir ?? OUT_DIR;
    mkdirSync(outDir, {recursive: true});
    let plates;
    let steps;
    let orogens;
    if (options.input) {
        ({plates, steps, orogens} = options.input);
    } else {
        console.log('Downloading PB2002 GeoJSON...');
        [plates, steps, orogens] = await Promise.all([
            fetchJson(SOURCES.plates),
            fetchJson(SOURCES.steps),
            fetchJson(SOURCES.orogens),
        ]);
    }

    console.log(
        outDir === OUT_DIR
            ? 'Writing gzipped output to public/tectonics/ ...'
            : `Writing gzipped output to ${outDir} ...`,
    );
    writeGzip(outDir, 'plates.json.gz', buildPlates(plates));
    writeGzip(outDir, 'orogens.json.gz', buildOrogens(orogens));
    writeGzip(outDir, 'boundaries.json.gz', buildBoundaries(steps));
    writeGzip(outDir, 'velocity.json.gz', buildVelocity(steps));
    console.log('Done.');
}

if (invokedAsProgram()) {
    try {
        const offline = offlineInput();
        const run = offline ? main(offline) : main();
        run.catch((err) => {
            console.error(err);
            process.exit(1);
        });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
