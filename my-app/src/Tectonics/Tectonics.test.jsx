import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";
import { lastDeckProps } from "../test/mocks/deckglReact.jsx";
import { server } from "../test/networkGuard";
import Tectonics, {
    DESKTOP_ZOOM,
    MAP_CONTROLLER,
    MAP_STYLES,
    MAPBOX_TOKEN_MESSAGE,
    PHONE_PORTRAIT_LONGITUDE_SPAN,
    PLATE_SHEET_RIGHT_INSET,
    TECTONICS_LAYOUT_CSS,
    defaultViewState,
    longitudeSpanDegrees,
    mapboxTokenFailed,
    VELOCITY_ARROW_MAX_PX,
    VELOCITY_ARROW_MIN_PX,
    VELOCITY_ARROW_OFFSET_PX,
    buildVelocityArrows,
    mercatorLatitudeDegreesPerPixel,
    overridingSign,
    velocityArrowLengthPx,
    velocityReference,
    VELOCITY_SCALE,
    buildBoundarySegments,
    buildSubductionTeeth,
} from "./Tectonics";
import { CATEGORIES } from "./constants";
import { fromColumnar } from "./boundaries.mjs";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Visible longitude from the same Web Mercator viewport deck.gl draws with.
function spanFromViewport(width, height, viewState) {
    const viewport = new WebMercatorViewport({
        width,
        height,
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        pitch: 0,
        bearing: 0,
    });
    const [west] = viewport.unproject([0, height / 2]);
    const [east] = viewport.unproject([width, height / 2]);
    const span = east - west;
    return span < 0 ? span + 360 : span;
}

describe("Tectonics basemap", () => {
    beforeEach(() => {
        server.use(http.get("*/tectonics/*", () => new HttpResponse(null, { status: 404 })));
        document.documentElement.dataset.theme = "light";
    });
    afterEach(() => {
        delete document.documentElement.dataset.theme;
    });

    it("uses light-v10 in light and dark-v10 in dark, following theme changes", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        const map = screen.getByTestId("mock-map");
        expect(MAP_STYLES).toEqual({
            light: "mapbox://styles/mapbox/light-v10",
            dark: "mapbox://styles/mapbox/dark-v10",
        });
        expect(map).toHaveAttribute("data-map-style", MAP_STYLES.light);

        await act(async () => {
            document.documentElement.dataset.theme = "dark";
        });
        expect(screen.getByTestId("mock-map")).toHaveAttribute("data-map-style", MAP_STYLES.dark);

        // Let the (failed) data load settle inside the test.
        await screen.findByText(/Could not load tectonic data/);
    });
});

describe("Tectonics plates layer and credit", () => {
    const plates = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { Code: "PA", PlateName: "Pacific" },
                // A ring with an edge on lon 180, like the real PA/AN/AU rings.
                geometry: { type: "Polygon", coordinates: [[[170, 0], [180, 0], [180, 10], [170, 10], [170, 0]]] },
            },
        ],
    };
    const empty = { type: "FeatureCollection", features: [] };

    beforeEach(() => {
        const files = { "plates.json.gz": plates, "boundaries.json.gz": empty, "orogens.json.gz": empty, "velocity.json.gz": [] };
        server.use(
            http.get("*/tectonics/:file", ({ params }) =>
                files[params.file] ? HttpResponse.json(files[params.file]) : new HttpResponse(null, { status: 404 })
            )
        );
    });

    it("fills plates without an outline, so the ±180 and pole ring edges draw no seam", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getByTestId("mock-deckgl").dataset.layerIds).toContain("plates"));
        const platesLayer = lastDeckProps.current.layers.flat(Infinity).find((layer) => layer?.id === "plates");
        expect(platesLayer.props.stroked).toBe(false);
        expect(platesLayer.props.filled).toBe(true);
        expect(platesLayer.props.pickable).toBe(true);
    });

    it("credits Bird (2003) and Ahlenius/Nordpil with the ODC-By 1.0 licence", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getByTestId("mock-deckgl").dataset.layerIds).toContain("plates"));
        const links = {
            "Peter Bird (2003)": "https://doi.org/10.1029/2001GC000252",
            "Hugo Ahlenius, Nordpil": "https://github.com/fraxen/tectonicplates",
            "ODC-By 1.0": "https://opendatacommons.org/licenses/by/1-0/",
        };
        for (const [name, href] of Object.entries(links)) {
            const link = screen.getByRole("link", { name });
            expect(link).toHaveAttribute("href", href);
            expect(link).toHaveAttribute("rel", "noopener noreferrer");
        }
        expect(screen.getByText(/GIS data/).textContent).toBe(
            "Data: PB2002 model, Peter Bird (2003); GIS data Hugo Ahlenius, Nordpil, ODC-By 1.0"
        );
    });
});

describe("Tectonics columnar boundaries", () => {
    const plates = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { Code: "PA", PlateName: "Pacific" },
                geometry: { type: "Polygon", coordinates: [[[170, 0], [180, 0], [180, 10], [170, 10], [170, 0]]] },
            },
        ],
    };
    const empty = { type: "FeatureCollection", features: [] };

    beforeEach(() => {
        const files = {
            "plates.json.gz": plates,
            "boundaries.json.gz": {
                seq: [1],
                stepClass: ["OSR"],
                plateBound: ["PA-AU"],
                velocity: [70],
                azimuth: [12],
                divergence: [1.5],
                rightLateral: [-0.5],
                coordinates: [[[10, 1], [11, 2]]],
            },
            "orogens.json.gz": empty,
            "velocity.json.gz": [],
        };
        server.use(
            http.get("*/tectonics/:file", ({ params }) =>
                files[params.file] ? HttpResponse.json(files[params.file]) : new HttpResponse(null, { status: 404 })
            )
        );
    });

    it("expands a columnar boundaries file into one feature per step", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getByTestId("mock-deckgl").dataset.layerIds).toContain("boundaries"));
        const layer = lastDeckProps.current.layers.flat(Infinity).find((item) => item?.id === "boundaries");
        expect(layer.props.data).toHaveLength(1);
        expect(layer.props.data[0]).toMatchObject({
            from: [10, 1],
            to: [11, 2],
            properties: {
                seq: 1,
                stepClass: "OSR",
                plateBound: "PA-AU",
                velocity: 70,
                divergence: 1.5,
                rightLateral: -0.5,
            },
        });
        expect(lastDeckProps.current.layers.flat(Infinity).some((item) => item?.id === "boundaries-casing")).toBe(false);
    });
});

describe("Tectonics phone portrait longitude", () => {
    it.each([
        [320, 700],
        [390, 844],
        [430, 932],
        [768, 1024],
    ])("shows at least 300° across a %ix%i portrait phone", (width, height) => {
        const view = defaultViewState(width, height);
        const analytic = longitudeSpanDegrees(width, view.zoom);
        const projected = spanFromViewport(width, height, view);
        expect(analytic).toBeGreaterThanOrEqual(300);
        expect(projected).toBeGreaterThanOrEqual(300);
        expect(analytic).toBeCloseTo(PHONE_PORTRAIT_LONGITUDE_SPAN, 5);
        expect(projected).toBeCloseTo(analytic, 5);
    });

    it("keeps the desktop and landscape zoom", () => {
        expect(defaultViewState(1440, 900).zoom).toBe(DESKTOP_ZOOM);
        expect(defaultViewState(844, 390).zoom).toBe(DESKTOP_ZOOM);
        expect(MAP_CONTROLLER).toMatchObject({ minZoom: -2, normalize: false });
    });
});

describe("Tectonics phone overlays and token message", () => {
    const plates = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { Code: "PA", PlateName: "Pacific" },
                geometry: { type: "Polygon", coordinates: [[[170, 0], [180, 0], [180, 10], [170, 10], [170, 0]]] },
            },
        ],
    };
    const empty = { type: "FeatureCollection", features: [] };

    beforeEach(() => {
        const files = { "plates.json.gz": plates, "boundaries.json.gz": empty, "orogens.json.gz": empty, "velocity.json.gz": [] };
        server.use(
            http.get("*/tectonics/:file", ({ params }) =>
                files[params.file] ? HttpResponse.json(files[params.file]) : new HttpResponse(null, { status: 404 })
            )
        );
        vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
            matches: query.includes("max-width: 768px"),
            media: query,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
        }));
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("insets the plate sheet clear of the controls button and caps the landscape drawer", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getByTestId("mock-deckgl").dataset.layerIds).toContain("plates"));
        const platesLayer = lastDeckProps.current.layers.flat(Infinity).find((layer) => layer?.id === "plates");
        act(() => {
            platesLayer.props.onClick({ object: plates.features[0] });
        });
        expect(document.querySelector(".mobile-sheet").style.right).toBe(PLATE_SHEET_RIGHT_INSET);
        expect(screen.getByRole("button", { name: "Controls" })).toBeInTheDocument();
        expect(document.querySelector("style").textContent).toBe(TECTONICS_LAYOUT_CSS);
        expect(TECTONICS_LAYOUT_CSS).toContain("top: 54dvh");
        expect(TECTONICS_LAYOUT_CSS).toContain("pointer-events: none");
    });

    it("shows a tap tooltip and dismisses it from the button, a second tap, or an empty tap", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        await waitFor(() => expect(lastDeckProps.current.getTooltip).toBeTypeOf("function"));
        const boundary = { properties: { stepClass: "OSR", plateBound: "PA-AU", velocity: 70 } };
        const info = { object: boundary, layer: { id: "boundaries" }, x: 120, y: 90 };
        expect(lastDeckProps.current.getTooltip(info)).toBeNull();

        act(() => lastDeckProps.current.onClick(info));
        expect(screen.getByRole("tooltip")).toHaveTextContent("Oceanic spreading ridge");
        expect(screen.getByRole("tooltip")).toHaveTextContent("70 mm/yr");

        act(() => lastDeckProps.current.onClick(info));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        act(() => lastDeckProps.current.onClick(info));
        act(() => lastDeckProps.current.onClick({ x: 10, y: 10 }));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        act(() => lastDeckProps.current.onClick(info));
        act(() => {
            screen.getByRole("button", { name: "Dismiss tooltip" }).click();
        });
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("shows a visible message when the Mapbox token is missing", () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        expect(screen.getByRole("status")).toHaveTextContent(MAPBOX_TOKEN_MESSAGE);
    });
});

function shaftPixels(segment, lat, zoom) {
    const degPerPx = mercatorLatitudeDegreesPerPixel(zoom);
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
    const dLat = segment.to[1] - segment.from[1];
    const dLon = segment.to[0] - segment.from[0];
    return Math.hypot(dLat, dLon * cosLat) / degPerPx;
}

describe("velocity arrows", () => {
    const plates = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { Code: "PA", PlateName: "Pacific" },
                geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
            },
            {
                type: "Feature",
                properties: { Code: "AU", PlateName: "Australia" },
                geometry: { type: "Polygon", coordinates: [[[2, 0], [3, 0], [3, 1], [2, 0]]] },
            },
        ],
    };
    const point = {
        lon: 10,
        lat: 0,
        azimuthDeg: 0,
        speed: 70,
        plateBound: "PA-AU",
        divergence: 1.5,
        rightLateral: -0.5,
        stepAzimuth: 90,
    };

    it("names the left plate relative to the right", () => {
        expect(velocityReference("PA-AU", plates)).toBe("Pacific relative to Australia");
        expect(velocityReference("NA/PA", plates)).toBe("NA relative to Pacific");
        expect(velocityReference("AU\\PA", plates)).toBe("Australia relative to Pacific");
    });

    it("keeps the shaft legible at zoom 1.6 and 5 and offsets it onto the left plate", () => {
        for (const zoom of [1.6, 5]) {
            for (const speed of [5, 40, 80, 200]) {
                const shaft = buildVelocityArrows([{ ...point, speed }], zoom, plates)[0];
                const px = shaftPixels(shaft, point.lat, zoom);
                expect(px).toBeGreaterThanOrEqual(VELOCITY_ARROW_MIN_PX - 0.01);
                expect(px).toBeLessThanOrEqual(VELOCITY_ARROW_MAX_PX + 0.01);
                expect(px).toBeCloseTo(velocityArrowLengthPx(speed), 5);
            }
        }
        const atWorld = buildVelocityArrows([point], 1.6, plates)[0];
        const atRidge = buildVelocityArrows([point], 5, plates)[0];
        expect(shaftPixels(atWorld, point.lat, 1.6)).toBeCloseTo(shaftPixels(atRidge, point.lat, 5), 5);
        // Step bearing 90° is due east, so the left plate is to the north.
        expect(atWorld.from[1]).toBeGreaterThan(point.lat);
        expect(atWorld.from[0]).toBeCloseTo(point.lon, 5);
        const degPerPx = mercatorLatitudeDegreesPerPixel(1.6);
        expect((atWorld.from[1] - point.lat) / degPerPx).toBeCloseTo(VELOCITY_ARROW_OFFSET_PX, 5);
        const west = buildVelocityArrows([{ ...point, stepAzimuth: 0 }], 1.6, plates)[0];
        expect(west.from[0]).toBeLessThan(point.lon);
        expect(atWorld.reference).toBe("Pacific relative to Australia");
    });
});

describe("Tectonics velocity tooltip", () => {
    const plates = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { Code: "PA", PlateName: "Pacific" },
                geometry: { type: "Polygon", coordinates: [[[170, 0], [180, 0], [180, 10], [170, 10], [170, 0]]] },
            },
            {
                type: "Feature",
                properties: { Code: "AU", PlateName: "Australia" },
                geometry: { type: "Polygon", coordinates: [[[150, -40], [160, -40], [160, -30], [150, -30], [150, -40]]] },
            },
        ],
    };
    const empty = { type: "FeatureCollection", features: [] };

    beforeEach(() => {
        const files = {
            "plates.json.gz": plates,
            "boundaries.json.gz": empty,
            "orogens.json.gz": empty,
            "velocity.json.gz": [{
                lon: 10,
                lat: 0,
                azimuthDeg: 0,
                speed: 70,
                plateBound: "PA-AU",
                divergence: 1.5,
                rightLateral: -0.5,
                stepAzimuth: 90,
            }],
        };
        server.use(
            http.get("*/tectonics/:file", ({ params }) =>
                files[params.file] ? HttpResponse.json(files[params.file]) : new HttpResponse(null, { status: 404 })
            )
        );
    });

    it("says which plate moves relative to which", async () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getByTestId("mock-deckgl").dataset.layerIds).toContain("plates"));
        act(() => {
            screen.getByRole("checkbox", { name: /Velocity vectors/ }).click();
        });
        await waitFor(() => expect(screen.getByTestId("mock-deckgl").dataset.layerIds).toContain("velocity"));
        const layer = lastDeckProps.current.layers.flat(Infinity).find((item) => item?.id === "velocity");
        expect(layer.props.pickable).toBe(true);
        const tip = lastDeckProps.current.getTooltip({
            object: layer.props.data[0],
            layer: { id: "velocity" },
        });
        expect(tip.html).toContain("Pacific relative to Australia");
        expect(tip.html).toContain("70 mm/yr");
    });
});

describe("mapbox token failure", () => {
    it("treats a missing token and a rejected token as failures, and ignores other map errors", () => {
        expect(mapboxTokenFailed(undefined, null)).toBe(true);
        expect(mapboxTokenFailed("", null)).toBe(true);
        expect(mapboxTokenFailed("   ", null)).toBe(true);
        expect(mapboxTokenFailed("pk.good", null)).toBe(false);
        expect(mapboxTokenFailed("pk.bad", { status: 401, message: "Unauthorized" })).toBe(true);
        expect(mapboxTokenFailed("pk.bad", { error: { status: 403, message: "Forbidden" } })).toBe(true);
        expect(mapboxTokenFailed("pk.bad", { message: "Not Authorized - Invalid Token" })).toBe(true);
        expect(mapboxTokenFailed("pk.bad", { message: "An API access token is required to use Mapbox GL." })).toBe(true);
        expect(mapboxTokenFailed("pk.good", { message: "Failed to fetch" })).toBe(false);
    });
});

// WCAG 2.x relative luminance, as used in reviews/theme/report.md:
// channel c/255 is c/12.92 when c ≤ 0.04045, else ((c+0.055)/1.055)^2.4.
// L = 0.2126R + 0.7152G + 0.0722B. Ratio (L1+0.05)/(L2+0.05).
const LIGHT_V10_OCEAN = [204, 210, 211];
// Absent until a token-backed sample of mapbox dark-v10 water exists.
// Do not invent this RGB, and do not substitute the unverified v11 value.
const DARK_V10_OCEAN = undefined;

function linearChannel(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encodeChannel(value) {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return 255 * encoded;
}

function contrastRatio(first, second) {
    const luminance = (rgb) => {
        const [red, green, blue] = rgb.map(linearChannel);
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const lighter = Math.max(luminance(first), luminance(second));
    const darker = Math.min(luminance(first), luminance(second));
    return (lighter + 0.05) / (darker + 0.05);
}

// Machado, Oliveira, and Fernandes 2009, full severity, applied in linear sRGB.
// Deuteranopia is the same matrix the hurricane category test uses.
const MACHADO_2009 = {
    deuteranopia: [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.011820, 0.042940, 0.968881],
    ],
    protanopia: [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
};

function simulateDeficiency(rgb, matrix) {
    const [red, green, blue] = rgb.map(linearChannel);
    return matrix.map((row) => encodeChannel(row[0] * red + row[1] * green + row[2] * blue));
}

// CIE76: Euclidean distance in CIE Lab (D65).
function cie76(first, second) {
    const lab = (rgb) => {
        const [red, green, blue] = rgb.map(linearChannel);
        const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
        const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
        const z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;
        const pivot = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
        const fy = pivot(y);
        return [116 * fy - 16, 500 * (pivot(x / 0.95047) - fy), 200 * (fy - pivot(z / 1.08883))];
    };
    const [l1, a1, b1] = lab(first);
    const [l2, a2, b2] = lab(second);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe("boundary palette", () => {
    it("clears 3:1 on light-v10 ocean 204,210,211", () => {
        for (const [key, { color }] of Object.entries(CATEGORIES)) {
            expect(contrastRatio(color, LIGHT_V10_OCEAN), key).toBeGreaterThanOrEqual(3);
        }
    });

    it("keeps every pair above 40 CIE76 ΔE under Machado 2009 deuteranopia and protanopia", () => {
        const keys = Object.keys(CATEGORIES);
        for (const deficiency of ["deuteranopia", "protanopia"]) {
            for (let i = 0; i < keys.length; i += 1) {
                for (let j = i + 1; j < keys.length; j += 1) {
                    const gap = cie76(
                        simulateDeficiency(CATEGORIES[keys[i]].color, MACHADO_2009[deficiency]),
                        simulateDeficiency(CATEGORIES[keys[j]].color, MACHADO_2009[deficiency]),
                    );
                    expect(gap, `${deficiency} ${keys[i]}/${keys[j]}`).toBeGreaterThan(40);
                }
            }
        }
    });

    (DARK_V10_OCEAN ? it : it.skip)("clears 3:1 on recorded dark-v10 water", () => {
        for (const { color } of Object.values(CATEGORIES)) {
            expect(contrastRatio(color, DARK_V10_OCEAN)).toBeGreaterThanOrEqual(3);
        }
    });
});

describe("boundary dashes and subduction teeth", () => {
    const line = (stepClass, subducting, coordinates = [[0, 0], [8, 0]]) => ({
        type: "Feature",
        properties: { seq: 9, stepClass, plateBound: "NA/PA", subducting },
        geometry: { type: "LineString", coordinates },
    });

    it("draws dash runs as separated segments and keeps a solid category whole", () => {
        const solid = buildBoundarySegments([line("CCB")], 4);
        expect(solid).toHaveLength(1);
        expect(solid[0].from).toEqual([0, 0]);
        expect(solid[0].to).toEqual([8, 0]);
        expect(solid[0].color).toEqual(CATEGORIES.convergent.color);

        const dashed = buildBoundarySegments([line("OTF")], 4);
        expect(dashed.length).toBeGreaterThan(1);
        expect(dashed[0].to[0]).toBeLessThan(dashed[1].from[0]);
        expect(dashed.every((segment) => segment.category === "transform")).toBe(true);
        expect(dashed[0].color).toEqual(CATEGORIES.transform.color);
    });

    it("offsets teeth opposite the stored side and grows none for a null or non-SUB row", () => {
        expect(overridingSign("R", "SUB")).toBe(-1);
        expect(overridingSign("L", "SUB")).toBe(1);
        expect(overridingSign(null, "SUB")).toBe(0);
        expect(overridingSign("R", "OTF")).toBe(0);
        // Due east: left of travel is north. plateBound is NA/PA for every row.
        const towardLeft = buildSubductionTeeth([line("SUB", "R")], 4)[0];
        const towardRight = buildSubductionTeeth([line("SUB", "L")], 4)[0];
        expect(towardLeft.to[1]).toBeGreaterThan(towardLeft.from[1]);
        expect(towardRight.to[1]).toBeLessThan(towardRight.from[1]);
        expect(buildSubductionTeeth([line("SUB", null)], 4)).toEqual([]);
        expect(buildSubductionTeeth([line("OTF", "R")], 4)).toEqual([]);
        expect(buildSubductionTeeth([line("OTF", null)], 4)).toEqual([]);
    });

    it("points Aleutian teeth toward North America and Andes teeth toward South America", () => {
        const gzipPath = join(process.cwd(), "public/tectonics/boundaries.json.gz");
        const columnar = JSON.parse(gunzipSync(readFileSync(gzipPath)).toString("utf8"));
        const features = fromColumnar(columnar).features;
        const at = (seq) => features[seq - columnar.seq0];
        const aleutians = at(2786);
        const andes = at(3056);
        expect(aleutians.properties).toMatchObject({ plateBound: "NA/PA", subducting: "R", stepClass: "SUB" });
        expect(andes.properties).toMatchObject({ plateBound: "NZ\\SA", subducting: "L", stepClass: "SUB" });
        const teeth = buildSubductionTeeth([aleutians, andes], 1.6);
        const aleutianTooth = teeth.find((tooth) => tooth.properties.seq === 2786);
        const andesTooth = teeth.find((tooth) => tooth.properties.seq === 3056);
        // SEQ 2786 runs southeast. North America is north of the trench.
        expect(aleutianTooth.to[1]).toBeGreaterThan(aleutianTooth.from[1]);
        // SEQ 3056 runs north. South America is east of the trench.
        expect(andesTooth.to[0]).toBeGreaterThan(andesTooth.from[0]);
    });
});

describe("velocity legend scale", () => {
    beforeEach(() => {
        server.use(http.get("*/tectonics/*", () => new HttpResponse(null, { status: 404 })));
    });

    it("states one mm/yr row for the 16–48 px clamp", () => {
        render(
            <MemoryRouter>
                <Tectonics />
            </MemoryRouter>
        );
        expect(VELOCITY_SCALE).toEqual({ minPx: 16, maxPx: 48, minMmYr: 20, maxMmYr: 60 });
        const scale = screen.getByRole("checkbox", { name: /Velocity vectors, 20–60 mm\/yr/ });
        expect(scale).toBeInTheDocument();
        const bars = scale.parentElement.querySelectorAll("[data-velocity-px]");
        expect([...bars].map((bar) => Number(bar.getAttribute("data-velocity-px")))).toEqual([16, 48]);
        expect(bars[0].style.width).toBe("16px");
        expect(bars[1].style.width).toBe("48px");
        expect(document.querySelector('[data-dash="solid"]')).toBeTruthy();
        for (const key of ["ridge", "transform", "subduction"]) {
            const swatch = document.querySelector(`[data-dash="${CATEGORIES[key].dash.join(",")}"]`);
            expect(swatch, key).toBeTruthy();
            const drawn = [...swatch.children].filter((piece) => piece.style.backgroundColor !== "transparent");
            expect(drawn[0].style.width).toBe(`${CATEGORIES[key].dash[0]}px`);
        }
    });
});
