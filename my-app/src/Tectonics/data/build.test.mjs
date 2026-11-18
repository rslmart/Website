// @vitest-environment node
// PB2002 build checks. npm test picks this up via src/**/*.test.mjs.
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {gunzipSync} from "node:zlib";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {fromColumnar, longitudeSpans, toColumnar} from "../boundaries.mjs";
import {
    DATA_THROUGH,
    PB2002_COMMIT,
    SOURCES,
    buildBoundaries,
    buildMeta,
    buildOrogens,
    buildPlates,
    buildVelocity,
    invokedAsProgram,
    measureArrowSpacing,
    platePairKey,
    VELOCITY_SPACING_KM,
} from "./build.mjs";

const dataDir = fileURLToPath(new URL(".", import.meta.url));
const buildPath = join(dataDir, "build.mjs");
const fixturePath = join(dataDir, "pb2002.fixture.json");
const appRoot = resolve(dataDir, "../../..");
const publishedDir = resolve(appRoot, "public/tectonics");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

const SOURCE_NAMES = ["PB2002_plates.json", "PB2002_steps.csv", "PB2002_orogens.json"];

function spansOf(boundaries) {
    return boundaries.features.flatMap((feature) => longitudeSpans(feature));
}

function publishedFingerprint() {
    return readdirSync(publishedDir)
        .sort()
        .map((name) => {
            const bytes = readFileSync(join(publishedDir, name));
            const hash = createHash("sha256").update(bytes).digest("hex");
            return `${name}:${bytes.length}:${hash}`;
        });
}

function readGzipJson(dir, name) {
    return JSON.parse(gunzipSync(readFileSync(join(dir, name))).toString("utf8"));
}

function childEnv(extra = {}) {
    const env = {...process.env, ...extra};
    delete env.NODE_OPTIONS;
    return env;
}

let publishedBefore;

beforeAll(() => {
    publishedBefore = publishedFingerprint();
});

afterAll(() => {
    expect(publishedFingerprint()).toEqual(publishedBefore);
});

describe("PB2002 fixture", () => {
    it("carries the ODC-By credit used for fraxen/tectonicplates", () => {
        expect(fixture.attribution.license).toContain("ODC-By");
        expect(fixture.attribution.licenseUrl).toBe("http://opendatacommons.org/licenses/by/1.0/");
        expect(fixture.attribution.credit).toBe("Hugo Ahlenius, Nordpil and Peter Bird");
        expect(fixture.attribution.notice).toContain("Open Data Commons Attribution License");
        expect(fixture.steps.features).toHaveLength(13);
        expect(fixture.plates.features).toHaveLength(2);
        expect(fixture.orogens.features).toHaveLength(2);
    });

    it("includes one step whose endpoints are more than 180° apart", () => {
        const crossing = fixture.steps.features[3].properties;
        expect(crossing.STEPCLASS).toBe("CRB");
        expect(Math.abs(crossing.FINALLONG - crossing.STARTLONG)).toBeCloseTo(359.5, 5);
    });
});

describe("build output", () => {
    const plates = buildPlates(fixture.plates);
    const orogens = buildOrogens(fixture.orogens);
    const boundaries = buildBoundaries(fixture.steps);
    const velocity = buildVelocity(fixture.steps);

    it("counts plate, orogen and boundary features and keeps every step class", () => {
        expect(plates.type).toBe("FeatureCollection");
        expect(plates.features).toHaveLength(2);
        expect(orogens.features).toHaveLength(2);
        expect(boundaries.features).toHaveLength(13);
        expect(boundaries.features.map((feature) => feature.properties.stepClass)).toEqual([
            "SUB", "OSR", "OTF", "CRB", "CTF", "CCB", "OCB",
            "SUB", "OSR", "OTF", "CRB", "CTF", "CCB",
        ]);
        const counts = {};
        for (const feature of boundaries.features) {
            counts[feature.properties.stepClass] = (counts[feature.properties.stepClass] ?? 0) + 1;
        }
        expect(counts).toEqual({SUB: 2, OSR: 2, OTF: 2, CRB: 2, CTF: 2, CCB: 2, OCB: 1});
    });

    it("rounds coordinates and keeps the plate, orogen and boundary schema", () => {
        expect(plates.features[0].properties).toEqual({Code: "AF", PlateName: "Africa"});
        expect(plates.features[0].geometry).toEqual({
            type: "Polygon",
            coordinates: [[[0.123, 1.988], [2.5, 3], [4.2, 1.1], [0.123, 1.988]]],
        });
        expect(plates.features[1].properties).toEqual({Code: "PA", PlateName: "Pacific"});
        expect(plates.features[1].geometry.type).toBe("MultiPolygon");
        expect(plates.features[1].geometry.coordinates[0][0][0]).toEqual([10.112, -20.222]);

        expect(orogens.features[0].properties).toEqual({Name: "Test Range"});
        expect(orogens.features[0].geometry.coordinates[0][0]).toEqual([1.235, 2]);
        expect(orogens.features[1].properties).toEqual({Name: "lowercase belt"});
        expect(orogens.features[1].geometry.coordinates[0][0]).toEqual([-1.111, 0]);

        expect(boundaries.type).toBe("FeatureCollection");
        expect(boundaries.features[0]).toEqual({
            type: "Feature",
            properties: {
                seq: 1,
                stepClass: "SUB",
                plateBound: "PA-NA",
                velocity: 25.457,
                azimuth: 12.345,
                divergence: 1.25,
                rightLateral: -3.5,
            },
            geometry: {
                type: "LineString",
                coordinates: [[10.112, -20.222], [10.555, -20.333]],
            },
        });
        const crossing = boundaries.features[3];
        expect(crossing.properties.seq).toBe(4);
        expect(crossing.geometry).toEqual({
            type: "MultiLineString",
            coordinates: [
                [[179.6, 5.25], [180, 5.45]],
                [[-180, 5.45], [-179.9, 5.5]],
            ],
        });
        for (const feature of boundaries.features) {
            expect(feature.type).toBe("Feature");
            expect(Object.keys(feature.properties)).toEqual([
                "seq", "stepClass", "plateBound", "velocity", "azimuth", "divergence", "rightLateral",
            ]);
            if (feature.properties.seq === 4) {
                expect(feature.geometry.type).toBe("MultiLineString");
            } else {
                expect(feature.geometry.type).toBe("LineString");
                expect(feature.geometry.coordinates).toHaveLength(2);
            }
        }
        const columnar = toColumnar(boundaries);
        expect(columnar.seq0).toBe(1);
        expect(columnar.seq).toBeUndefined();
        expect(fromColumnar(columnar)).toEqual(boundaries);
    });

    it("stores a gapped SEQNUM list instead of a contiguous seq0", () => {
        const gapped = buildBoundaries({
            type: "FeatureCollection",
            features: [fixture.steps.features[0], fixture.steps.features[2]],
        });
        const columnar = toColumnar(gapped);
        expect(columnar.seq).toEqual([1, 3]);
        expect(columnar.seq0).toBeUndefined();
        expect(fromColumnar(columnar)).toEqual(gapped);
    });

    it("samples a step midpoint on every plate pair, including a zero speed", () => {
        const pairs = new Set(fixture.steps.features.map((feature) => platePairKey(feature.properties.PLATEBOUND)));
        expect(VELOCITY_SPACING_KM).toBe(250);
        // Every fixture pair is far shorter than 250 km, so each gets one arrow.
        expect(velocity).toHaveLength(pairs.size);
        expect(velocity.map((point) => platePairKey(point.plateBound)).sort()).toEqual([...pairs].sort());
        expect(velocity.find((point) => point.plateBound === "PA-NA")).toEqual({
            lon: 10.333,
            lat: -20.278,
            azimuthDeg: 12.345,
            speed: 25.457,
            divergence: 1.25,
            rightLateral: -3.5,
            plateBound: "PA-NA",
            stepAzimuth: expect.any(Number),
        });
        const crossing = velocity.find((point) => point.plateBound === "KE-AU");
        expect(crossing.lon).toBe(179.85);
        expect(crossing.lat).toBe(5.375);
        expect(velocity.filter((point) => platePairKey(point.plateBound) === "AF-AN")).toHaveLength(1);
        expect(velocity.find((point) => point.plateBound === "PS-AU").speed).toBe(0);
        for (const point of velocity) {
            expect(point).toEqual(expect.objectContaining({
                divergence: expect.any(Number),
                rightLateral: expect.any(Number),
                plateBound: expect.any(String),
                stepAzimuth: expect.any(Number),
            }));
        }
    });

    it("places one arrow about every 250 km, and still one on a short pair", () => {
        const alongEquator = (seq, lon, plate = "PA-NA") => ({
            type: "Feature",
            properties: {
                SEQNUM: seq,
                STEPCLASS: "OSR",
                PLATEBOUND: plate,
                VELOCITYLE: 50,
                VELOCITYAZ: 0,
                VELOCITYDI: 50,
                VELOCITYRI: 1,
                STARTLONG: lon,
                STARTLAT: 0,
                FINALLONG: lon + 0.9,
                FINALLAT: 0,
                STEPLENGTH: 100,
                AZIMUTH: 90,
            },
        });
        const chain = Array.from({length: 10}, (_, i) => alongEquator(i + 1, i));
        const sampled = buildVelocity({type: "FeatureCollection", features: chain});
        expect(sampled).toHaveLength(4);
        expect(sampled.every((point) => point.plateBound === "PA-NA")).toBe(true);
        expect(sampled.every((point) => point.divergence === 50 && point.rightLateral === 1)).toBe(true);
        expect(sampled.every((point) => point.stepAzimuth === 90)).toBe(true);
        const short = buildVelocity({
            type: "FeatureCollection",
            features: [alongEquator(1, 0, "AF-AN")],
        });
        expect(short).toHaveLength(1);
        expect(short[0].lon).toBeCloseTo(0.45, 5);
        // Polarity slashes are the same pair, so two short pieces share one arrow.
        const joined = buildVelocity({
            type: "FeatureCollection",
            features: [alongEquator(1, 0, "NA/PA"), alongEquator(2, 2, "NA-PA")],
        });
        expect(joined).toHaveLength(1);
        expect(platePairKey(joined[0].plateBound)).toBe("NA-PA");
    });

    it("keeps one feature when a SEQNUM is repeated", () => {
        const first = fixture.steps.features[0];
        const repeated = {
            type: "FeatureCollection",
            features: [
                first,
                {
                    ...first,
                    properties: {...first.properties, STARTLONG: 1, FINALLONG: 2},
                },
                fixture.steps.features[1],
            ],
        };
        const built = buildBoundaries(repeated);
        expect(built.features.map((feature) => feature.properties.seq)).toEqual([1, 2]);
        expect(built.features[0].geometry.coordinates[0]).toEqual([10.112, -20.222]);
    });

    it("no segment spans more than 180°", () => {
        expect(Math.max(...spansOf(boundaries))).toBeLessThanOrEqual(180);
    });
});

describe("import guard", () => {
    it("is not the program when Vitest loads the module", () => {
        expect(invokedAsProgram()).toBe(false);
        expect(invokedAsProgram(buildPath, pathToFileURL(buildPath).href)).toBe(true);
    });

    it("does not download or write when the module is imported", () => {
        const dir = mkdtempSync(join(tmpdir(), "tectonics-import-"));
        const checker = join(dir, "import-check.mjs");
        writeFileSync(
            checker,
            `globalThis.fetch = async (url) => {
                console.error("FETCH " + url);
                throw new Error("fetch " + url);
            };
            await import(${JSON.stringify(pathToFileURL(buildPath).href)});
            console.log("imported");
            `,
        );
        const env = childEnv();
        delete env.TECTONICS_BUILD_OFFLINE;
        delete env.TECTONICS_PB2002_FIXTURE;
        delete env.TECTONICS_OUT_DIR;
        const result = spawnSync(process.execPath, [checker], {env, encoding: "utf8", timeout: 15000});
        rmSync(dir, {recursive: true, force: true});
        expect({status: result.status, stdout: result.stdout, stderr: result.stderr}).toMatchObject({
            status: 0,
            stdout: "imported\n",
        });
        expect(result.stderr).not.toContain("FETCH ");
        expect(publishedFingerprint()).toEqual(publishedBefore);
    });

    it("still builds when the file is the program", () => {
        const outDir = mkdtempSync(join(tmpdir(), "tectonics-build-"));
        const preload = join(outDir, "block-fetch.mjs");
        writeFileSync(
            preload,
            `globalThis.fetch = async (url) => {
                console.error("BLOCKED " + url);
                throw new Error("blocked " + url);
            };
            `,
        );
        const result = spawnSync(
            process.execPath,
            ["--import", preload, "src/Tectonics/data/build.mjs"],
            {
                cwd: appRoot,
                env: childEnv({
                    TECTONICS_BUILD_OFFLINE: "1",
                    TECTONICS_PB2002_FIXTURE: fixturePath,
                    TECTONICS_OUT_DIR: outDir,
                }),
                encoding: "utf8",
                timeout: 15000,
            },
        );
        expect({status: result.status, stdout: result.stdout, stderr: result.stderr}).toMatchObject({
            status: 0,
        });
        expect(result.stdout).toContain("Done.");
        expect(result.stdout).not.toContain("Downloading PB2002");
        expect(result.stderr).not.toContain("BLOCKED ");
        expect(readdirSync(outDir).filter((name) => name.endsWith(".gz")).sort()).toEqual([
            "boundaries.json.gz",
            "orogens.json.gz",
            "plates.json.gz",
            "velocity.json.gz",
        ]);
        expect(readGzipJson(outDir, "plates.json.gz")).toEqual(buildPlates(fixture.plates));
        expect(readGzipJson(outDir, "orogens.json.gz")).toEqual(buildOrogens(fixture.orogens));
        const built = buildBoundaries(fixture.steps);
        expect(readGzipJson(outDir, "boundaries.json.gz")).toEqual(toColumnar(built));
        expect(fromColumnar(readGzipJson(outDir, "boundaries.json.gz"))).toEqual(built);
        expect(readGzipJson(outDir, "velocity.json.gz")).toEqual(buildVelocity(fixture.steps));
        const meta = JSON.parse(readFileSync(join(outDir, "meta.json"), "utf8"));
        expect(meta).toMatchObject({
            version: PB2002_COMMIT,
            dataThrough: DATA_THROUGH,
            commit: PB2002_COMMIT,
        });
        expect(meta.source).toContain(PB2002_COMMIT);
        expect(meta.source).toContain("PB2002_steps.csv");
        expect(meta.licence).toContain("ODC-By");
        expect(meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        expect(meta).toEqual(buildMeta(meta.generatedAt));
        rmSync(outDir, {recursive: true, force: true});
        expect(publishedFingerprint()).toEqual(publishedBefore);
    });

    it("starts the real download when invoked with no offline fixture, and writes nothing if fetch is blocked", () => {
        const dir = mkdtempSync(join(tmpdir(), "tectonics-block-"));
        const preload = join(dir, "block-fetch.mjs");
        writeFileSync(
            preload,
            `globalThis.fetch = async (url) => {
                console.error("BLOCKED " + url);
                throw new Error("blocked " + url);
            };
            `,
        );
        const env = childEnv();
        delete env.TECTONICS_BUILD_OFFLINE;
        delete env.TECTONICS_PB2002_FIXTURE;
        delete env.TECTONICS_OUT_DIR;
        const result = spawnSync(
            process.execPath,
            ["--import", preload, "src/Tectonics/data/build.mjs"],
            {cwd: appRoot, env, encoding: "utf8", timeout: 15000},
        );
        rmSync(dir, {recursive: true, force: true});
        expect(result.status).not.toBe(0);
        expect(result.stdout).toContain("Downloading PB2002 GeoJSON...");
        expect(result.stdout).not.toContain("Done.");
        for (const name of SOURCE_NAMES) {
            expect(result.stderr).toContain(name);
        }
        expect(result.stderr).toContain(
            `raw.githubusercontent.com/fraxen/tectonicplates/${PB2002_COMMIT}/`,
        );
        expect(result.stderr).not.toContain("/master/");
        expect(result.stderr).not.toContain("PB2002_steps.json");
        expect(SOURCES).toHaveLength(3);
        for (const source of SOURCES) {
            expect(source.url).toContain(PB2002_COMMIT);
            expect(result.stderr).toContain(source.url);
        }
        expect(publishedFingerprint()).toEqual(publishedBefore);
    });
});

describe("published PB2002 boundaries", () => {
    const columnar = readGzipJson(publishedDir, "boundaries.json.gz");
    const boundaries = fromColumnar(columnar);
    const gzipBytes = readFileSync(join(publishedDir, "boundaries.json.gz")).length;

    it("has 5,819 steps, one per SEQNUM, and no segment over 180°", () => {
        expect(columnar.seq0).toBe(1);
        expect(columnar.seq).toBeUndefined();
        expect(boundaries.features).toHaveLength(5819);
        expect(boundaries.features.map((feature) => feature.properties.seq)).toEqual(
            Array.from({length: 5819}, (_, i) => i + 1),
        );
        expect(Math.max(...spansOf(boundaries))).toBeLessThanOrEqual(180);
        const split = boundaries.features.filter((feature) => feature.geometry.type === "MultiLineString");
        expect(split.map((feature) => feature.properties.seq).sort((a, b) => a - b)).toEqual([
            1152, 1465, 1547, 2795, 4924, 4946,
        ]);
        for (const feature of boundaries.features) {
            if (feature.geometry.type === "LineString") {
                expect(feature.geometry.coordinates).toHaveLength(2);
            }
            expect(feature.properties).toEqual(expect.objectContaining({
                divergence: expect.any(Number),
                rightLateral: expect.any(Number),
            }));
        }
    });

    it("spaces published velocity arrows across all 161 plate pairs", () => {
        const velocity = readGzipJson(publishedDir, "velocity.json.gz");
        const steps = boundaries.features.map((feature) => {
            const lines = feature.geometry.type === "LineString"
                ? [feature.geometry.coordinates]
                : feature.geometry.coordinates;
            const start = lines[0][0];
            const endLine = lines[lines.length - 1];
            const end = endLine[endLine.length - 1];
            return {
                STARTLONG: start[0],
                STARTLAT: start[1],
                FINALLONG: end[0],
                FINALLAT: end[1],
                PLATEBOUND: feature.properties.plateBound,
            };
        });
        const spacing = measureArrowSpacing(velocity, steps);
        expect(spacing.pairs).toBe(161);
        expect(spacing.missingPairs).toEqual([]);
        expect(spacing.cv).toBeLessThanOrEqual(0.25);
        expect(spacing.nnMin).toBeGreaterThanOrEqual(50);
        expect(spacing.gapMax).toBeLessThanOrEqual(300);
        for (const point of velocity) {
            expect(point).toEqual(expect.objectContaining({
                plateBound: expect.any(String),
                divergence: expect.any(Number),
                rightLateral: expect.any(Number),
                stepAzimuth: expect.any(Number),
            }));
        }
    });

    it("stays at or under 90 KB and records provenance", () => {
        expect(gzipBytes).toBeLessThanOrEqual(90_000);
        const meta = JSON.parse(readFileSync(join(publishedDir, "meta.json"), "utf8"));
        expect(meta.version).toBe(PB2002_COMMIT);
        expect(meta.commit).toBe(PB2002_COMMIT);
        expect(meta.dataThrough).toBe(DATA_THROUGH);
        expect(meta.source).toContain("PB2002_steps.csv");
        expect(meta.licence).toContain("ODC-By");
        expect(meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
});
