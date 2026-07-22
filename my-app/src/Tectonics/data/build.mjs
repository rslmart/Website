// Downloads the Peter Bird PB2002 plate model (fraxen/tectonicplates) and
// produces trimmed, gzipped GeoJSON for the /Tectonics page.
//
//   node src/Tectonics/data/build.mjs
//
// Outputs (gzipped) into my-app/public/tectonics/:
//   - plates.json.gz      polygons with { Code, PlateName }
//   - boundaries.json.gz  line segments colored by STEPCLASS (+ velocity)
//   - orogens.json.gz     orogeny polygons
//   - velocity.json.gz    sampled arrow points { lon, lat, azimuthDeg, speed }
//
// The raw PB2002 files are Africa-fixed; STEPCLASS is Bird's boundary-type code
// (SUB, OSR, OTF, CRB, CTF, CCB, OCB) and VELOCITYLE/VELOCITYAZ give the
// relative motion across each boundary segment.

import {gzipSync} from 'node:zlib';
import {mkdirSync, writeFileSync} from 'node:fs';
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

function writeGzip(name, obj) {
    const json = JSON.stringify(obj);
    const gz = gzipSync(Buffer.from(json), {level: 9});
    const path = resolve(OUT_DIR, name);
    writeFileSync(path, gz);
    console.log(`  ${name}: ${(json.length / 1e6).toFixed(2)}MB -> ${(gz.length / 1e6).toFixed(2)}MB gz`);
}

function buildPlates(raw) {
    return {
        type: 'FeatureCollection',
        features: raw.features.map((f) => ({
            type: 'Feature',
            properties: {Code: f.properties.Code, PlateName: f.properties.PlateName},
            geometry: roundGeometry(f.geometry),
        })),
    };
}

function buildOrogens(raw) {
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
function buildBoundaries(rawSteps) {
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

function buildVelocity(rawSteps) {
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

async function main() {
    mkdirSync(OUT_DIR, {recursive: true});
    console.log('Downloading PB2002 GeoJSON...');
    const [plates, steps, orogens] = await Promise.all([
        fetchJson(SOURCES.plates),
        fetchJson(SOURCES.steps),
        fetchJson(SOURCES.orogens),
    ]);

    console.log('Writing gzipped output to public/tectonics/ ...');
    writeGzip('plates.json.gz', buildPlates(plates));
    writeGzip('orogens.json.gz', buildOrogens(orogens));
    writeGzip('boundaries.json.gz', buildBoundaries(steps));
    writeGzip('velocity.json.gz', buildVelocity(steps));
    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
