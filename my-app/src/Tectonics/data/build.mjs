// Downloads the Peter Bird PB2002 plate model (Bird 2003, G-Cubed 4(3) 1027,
// doi:10.1029/2001GC000252) as converted by Hugo Ahlenius, Nordpil
// (fraxen/tectonicplates, ODC-By 1.0; the app's legend carries the credit) and
// produces trimmed, gzipped GeoJSON for the /Tectonics page.
//
//   node src/Tectonics/data/build.mjs
//
// Importing this module does not download or write. That happens only when
// the file is the node entry point. A normal run leaves
// TECTONICS_BUILD_OFFLINE unset and writes the four gzipped files plus
// meta.json. Tests set that variable to 1, with TECTONICS_PB2002_FIXTURE and
// TECTONICS_OUT_DIR, to build a local fixture into a temporary directory.
//
// Source: fraxen/tectonicplates commit
// 339b0c56563c118307b1f4542703047f5f698fae (2014-10-06), fetched by hash.
// Steps come from original/PB2002_steps.csv. See README.md.
//
// Outputs into my-app/public/tectonics/:
//   - plates.json.gz      54 polygons with { Code, PlateName }
//   - boundaries.json.gz  5,819 steps, one per SEQNUM, columnar
//                         (seq0, stepClass, plateBound, velocity, azimuth,
//                         divergence, rightLateral, coordinates)
//   - orogens.json.gz     13 orogeny polygons
//   - velocity.json.gz    sampled arrow points { lon, lat, azimuthDeg, speed }
//   - meta.json           source, version, generatedAt, dataThrough, commit, licence
//
// STEPCLASS is Bird's boundary-type code (SUB, OSR, OTF, CRB, CTF, CCB, OCB).
// VELOCITYLE/VELOCITYAZ are the velocity of the left plate relative to the
// right plate across each step (mm/yr, azimuth clockwise from north), not a
// fixed-frame velocity. VELOCITYDI is the divergent component (convergence
// negative) and VELOCITYRI the right-lateral component, both mm/yr.
//
// Antimeridian: Bird's CSV has one row per step. A step whose endpoints are
// more than 180° apart crosses ±180, so it is written as a MultiLineString
// split at that meridian with the latitude interpolated. Other steps stay
// two-point LineStrings. The page still sets deck.gl `wrapLongitude`.

import {gzipSync} from 'node:zlib';
import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {longitudeSpans, toColumnar} from '../boundaries.mjs';

// fraxen/tectonicplates is frozen at this commit (2014-10-06). Fetch it by
// hash, not master. The three files below are the whole download.
export const PB2002_COMMIT = '339b0c56563c118307b1f4542703047f5f698fae';
// Bird (2003) was issued in March 2003 (Crossref 10.1029/2001GC000252, year
// and month only). The steps have no observation timestamps, so dataThrough
// is that publication month. The commit date is `version`, not this field.
export const DATA_THROUGH = '2003-03';
const MAX_FETCH_BYTES = 1_000_000;
const MAX_BOUNDARY_GZIP = 90_000;
const EXPECTED_STEPS = 5819;

const RAW = `https://raw.githubusercontent.com/fraxen/tectonicplates/${PB2002_COMMIT}`;
export const SOURCES = [
    {name: 'plates', url: `${RAW}/GeoJSON/PB2002_plates.json`, kind: 'json'},
    {name: 'steps', url: `${RAW}/original/PB2002_steps.csv`, kind: 'csv'},
    {name: 'orogens', url: `${RAW}/GeoJSON/PB2002_orogens.json`, kind: 'json'},
];

// Keep every Nth step as a velocity arrow so the map is not overwhelmed.
const VELOCITY_SAMPLE = 6;
const COORD_PRECISION = 3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../public/tectonics');

const round = (n) => Number(n.toFixed(COORD_PRECISION));
const roundPair = ([lon, lat]) => [round(lon), round(lat)];

async function fetchSource(source) {
    if (!source.url.includes(PB2002_COMMIT)) {
        throw new Error(`Refusing to fetch an unpinned URL: ${source.url}`);
    }
    const res = await fetch(source.url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${source.url} (${res.status})`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {source, bytes};
}

function gzipJson(obj) {
    const json = JSON.stringify(obj);
    const gz = gzipSync(Buffer.from(json), {level: 9, mtime: 0});
    return {json, gz};
}

function writeGzipFile(outDir, name, packed) {
    writeFileSync(resolve(outDir, name), packed.gz);
    console.log(
        `  ${name}: ${(packed.json.length / 1e6).toFixed(2)}MB -> ${(packed.gz.length / 1e6).toFixed(2)}MB gz`,
    );
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

const CSV_COLUMNS = [
    'SeqNum',
    'PlateBoundIdentifer',
    'StartLong',
    'StartLat',
    'FinalLong',
    'FinalLat',
    'VelocityLeft',
    'VelocityAzimuth',
    'VelocityDivergent',
    'VelocityRightLateral',
    'StepClass',
];

function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new Error(`PB2002 step is missing a finite ${label}`);
    }
    return number;
}

// fraxen's GeoJSON uses Bird's original names. The pinned CSV renames them
// and misspells the plate-boundary column. Both become one record shape.
function normalizeStep(raw) {
    const seq = finiteNumber(raw.SEQNUM ?? raw.SeqNum, 'SEQNUM');
    const stepClass = raw.STEPCLASS ?? raw.StepClass;
    const plateBound = raw.PLATEBOUND ?? raw.PlateBoundIdentifer;
    if (!stepClass || plateBound == null || plateBound === '') {
        throw new Error(`PB2002 step ${seq} is missing a class or plate pair`);
    }
    return {
        SEQNUM: seq,
        STEPCLASS: stepClass,
        PLATEBOUND: plateBound,
        VELOCITYLE: finiteNumber(raw.VELOCITYLE ?? raw.VelocityLeft, 'VELOCITYLE'),
        VELOCITYAZ: finiteNumber(raw.VELOCITYAZ ?? raw.VelocityAzimuth, 'VELOCITYAZ'),
        VELOCITYDI: finiteNumber(raw.VELOCITYDI ?? raw.VelocityDivergent, 'VELOCITYDI'),
        VELOCITYRI: finiteNumber(raw.VELOCITYRI ?? raw.VelocityRightLateral, 'VELOCITYRI'),
        STARTLONG: finiteNumber(raw.STARTLONG ?? raw.StartLong, 'STARTLONG'),
        STARTLAT: finiteNumber(raw.STARTLAT ?? raw.StartLat, 'STARTLAT'),
        FINALLONG: finiteNumber(raw.FINALLONG ?? raw.FinalLong, 'FINALLONG'),
        FINALLAT: finiteNumber(raw.FINALLAT ?? raw.FinalLat, 'FINALLAT'),
    };
}

export function parseStepsCsv(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const header = lines[0].split(',');
    const index = new Map(header.map((name, i) => [name, i]));
    for (const name of CSV_COLUMNS) {
        if (!index.has(name)) {
            throw new Error(`PB2002 steps CSV is missing ${name}`);
        }
    }
    const features = [];
    for (let row = 1; row < lines.length; row++) {
        const cells = lines[row].split(',');
        if (cells.length !== header.length) {
            throw new Error(`PB2002 steps CSV row ${row + 1} has ${cells.length} columns`);
        }
        const raw = {};
        for (const name of CSV_COLUMNS) {
            raw[name] = cells[index.get(name)];
        }
        const properties = normalizeStep(raw);
        features.push({
            type: 'Feature',
            properties,
            geometry: {
                type: 'LineString',
                coordinates: [
                    [properties.STARTLONG, properties.STARTLAT],
                    [properties.FINALLONG, properties.FINALLAT],
                ],
            },
        });
    }
    return {type: 'FeatureCollection', features};
}

// One record per SEQNUM, Bird's order. A repeated SEQNUM keeps the first row.
export function prepareSteps(rawSteps) {
    const list = rawSteps.features ?? rawSteps;
    const bySeq = new Map();
    for (const item of list) {
        const properties = normalizeStep(item.properties ?? item);
        if (!bySeq.has(properties.SEQNUM)) bySeq.set(properties.SEQNUM, properties);
    }
    const records = [...bySeq.values()].sort((a, b) => a.SEQNUM - b.SEQNUM);
    return {
        type: 'FeatureCollection',
        features: records.map((properties) => ({
            type: 'Feature',
            properties,
            geometry: {
                type: 'LineString',
                coordinates: [
                    [properties.STARTLONG, properties.STARTLAT],
                    [properties.FINALLONG, properties.FINALLAT],
                ],
            },
        })),
    };
}

// Longitudes in [-180, 180] only exceed a 180° difference when the short path
// crosses the antimeridian. Split there. The latitude is linear in longitude
// along that unwrapped segment, then rounded to Bird's 0.001°.
function stepGeometry(p) {
    const start = [round(p.STARTLONG), round(p.STARTLAT)];
    const end = [round(p.FINALLONG), round(p.FINALLAT)];
    if (Math.abs(p.FINALLONG - p.STARTLONG) <= 180) {
        return {type: 'LineString', coordinates: [start, end]};
    }
    const eastbound = p.STARTLONG > 0;
    const edge = eastbound ? 180 : -180;
    const unwrappedEnd = p.FINALLONG + (eastbound ? 360 : -360);
    const t = (edge - p.STARTLONG) / (unwrappedEnd - p.STARTLONG);
    const lat = round(p.STARTLAT + t * (p.FINALLAT - p.STARTLAT));
    return {
        type: 'MultiLineString',
        coordinates: [
            [start, [edge, lat]],
            [[-edge, lat], end],
        ],
    };
}

// Logical boundaries, one feature per SEQNUM. The file written to disk is the
// columnar form from `toColumnar`. Steps that do not cross ±180 stay two points.
export function buildBoundaries(rawSteps) {
    const features = prepareSteps(rawSteps).features.map((feature) => {
        const p = feature.properties;
        return {
            type: 'Feature',
            properties: {
                seq: p.SEQNUM,
                stepClass: p.STEPCLASS,
                plateBound: p.PLATEBOUND,
                velocity: round(p.VELOCITYLE),
                azimuth: round(p.VELOCITYAZ),
                divergence: round(p.VELOCITYDI),
                rightLateral: round(p.VELOCITYRI),
            },
            geometry: stepGeometry(p),
        };
    });
    return {type: 'FeatureCollection', features};
}

export function buildVelocity(rawSteps) {
    const points = [];
    prepareSteps(rawSteps).features.forEach((feature, i) => {
        if (i % VELOCITY_SAMPLE !== 0) return;
        const p = feature.properties;
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

function assertBoundarySpans(boundaries) {
    for (const feature of boundaries.features) {
        for (const span of longitudeSpans(feature)) {
            if (span > 180) {
                throw new Error(
                    `SEQNUM ${feature.properties.seq} has a segment spanning ${span}°`,
                );
            }
        }
    }
}

export function buildMeta(generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')) {
    return {
        source: `${RAW}/original/PB2002_steps.csv`,
        version: PB2002_COMMIT,
        generatedAt,
        dataThrough: DATA_THROUGH,
        commit: PB2002_COMMIT,
        licence: 'ODC-By 1.0 (https://opendatacommons.org/licenses/by/1-0/)',
    };
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
    let plates;
    let steps;
    let orogens;
    if (options.input) {
        ({plates, steps, orogens} = options.input);
    } else {
        if (SOURCES.length > 3) {
            throw new Error(`PB2002 build lists ${SOURCES.length} files; the limit is 3`);
        }
        console.log('Downloading PB2002 GeoJSON...');
        const fetched = await Promise.all(SOURCES.map((source) => fetchSource(source)));
        const total = fetched.reduce((sum, item) => sum + item.bytes.length, 0);
        console.log(`Fetched ${fetched.length} files, ${total} bytes`);
        if (fetched.length > 3 || total >= MAX_FETCH_BYTES) {
            throw new Error(`PB2002 download is ${fetched.length} files and ${total} bytes`);
        }
        const text = Object.fromEntries(
            fetched.map((item) => [item.source.name, item.bytes.toString('utf8')]),
        );
        plates = JSON.parse(text.plates);
        steps = parseStepsCsv(text.steps);
        orogens = JSON.parse(text.orogens);
    }

    const boundaries = buildBoundaries(steps);
    assertBoundarySpans(boundaries);
    if (!options.input && boundaries.features.length !== EXPECTED_STEPS) {
        throw new Error(`expected ${EXPECTED_STEPS} steps, got ${boundaries.features.length}`);
    }
    const seqs = new Set(boundaries.features.map((feature) => feature.properties.seq));
    if (seqs.size !== boundaries.features.length) {
        throw new Error('boundary SEQNUM values are not unique');
    }

    const packed = {
        'plates.json.gz': gzipJson(buildPlates(plates)),
        'orogens.json.gz': gzipJson(buildOrogens(orogens)),
        'boundaries.json.gz': gzipJson(toColumnar(boundaries)),
        'velocity.json.gz': gzipJson(buildVelocity(steps)),
    };
    const boundaryBytes = packed['boundaries.json.gz'].gz.length;
    if (boundaryBytes > MAX_BOUNDARY_GZIP) {
        throw new Error(`boundaries.json.gz is ${boundaryBytes} bytes; the limit is ${MAX_BOUNDARY_GZIP}`);
    }

    mkdirSync(outDir, {recursive: true});
    console.log(
        outDir === OUT_DIR
            ? 'Writing gzipped output to public/tectonics/ ...'
            : `Writing gzipped output to ${outDir} ...`,
    );
    for (const [name, file] of Object.entries(packed)) {
        writeGzipFile(outDir, name, file);
    }
    writeFileSync(resolve(outDir, 'meta.json'), `${JSON.stringify(buildMeta(), null, 2)}\n`);
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
