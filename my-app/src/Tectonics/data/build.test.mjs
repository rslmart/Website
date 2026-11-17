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
import {
    buildBoundaries,
    buildOrogens,
    buildPlates,
    buildVelocity,
    invokedAsProgram,
} from "./build.mjs";

const dataDir = fileURLToPath(new URL(".", import.meta.url));
const buildPath = join(dataDir, "build.mjs");
const fixturePath = join(dataDir, "pb2002.fixture.json");
const appRoot = resolve(dataDir, "../../..");
const publishedDir = resolve(appRoot, "public/tectonics");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

const SOURCE_NAMES = ["PB2002_plates.json", "PB2002_steps.json", "PB2002_orogens.json"];

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
                stepClass: "SUB",
                plateBound: "PA-NA",
                velocity: 25.457,
                azimuth: 12.345,
            },
            geometry: {
                type: "LineString",
                coordinates: [[10.112, -20.222], [10.555, -20.333]],
            },
        });
        for (const feature of boundaries.features) {
            expect(feature.type).toBe("Feature");
            expect(Object.keys(feature.properties)).toEqual([
                "stepClass", "plateBound", "velocity", "azimuth",
            ]);
            expect(feature.geometry.type).toBe("LineString");
            expect(feature.geometry.coordinates).toHaveLength(2);
        }
    });

    it("samples every 6th step and drops non-positive speeds", () => {
        expect(velocity).toEqual([
            {lon: 10.112, lat: -20.222, azimuthDeg: 12.345, speed: 25.457},
            {lon: -40.5, lat: 12.25, azimuthDeg: 180.1, speed: 15.555},
        ]);
    });

    // The builder still copies START/FINAL, so the fixture's crossing step is
    // emitted as one 359.5° segment. website-prop-pipeline-tectonics-boundary-fidelity
    // (still todo) owns the split. When that lands, this expected failure
    // starts passing and has to become a normal assertion.
    it.fails("no segment spans more than 180°", () => {
        const spans = boundaries.features.map((feature) => {
            const [start, end] = feature.geometry.coordinates;
            return Math.abs(end[0] - start[0]);
        });
        expect(Math.max(...spans)).toBeLessThanOrEqual(180);
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
        expect(readGzipJson(outDir, "boundaries.json.gz")).toEqual(buildBoundaries(fixture.steps));
        expect(readGzipJson(outDir, "velocity.json.gz")).toEqual(buildVelocity(fixture.steps));
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
        expect(result.stderr).toContain("raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/");
        expect(publishedFingerprint()).toEqual(publishedBefore);
    });
});
