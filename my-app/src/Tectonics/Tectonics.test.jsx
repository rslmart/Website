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
    velocityArrowLengthPx,
    velocityReference,
} from "./Tectonics";

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
        expect(layer.props.data.features).toHaveLength(1);
        expect(layer.props.data.features[0]).toMatchObject({
            properties: {
                seq: 1,
                stepClass: "OSR",
                plateBound: "PA-AU",
                velocity: 70,
                divergence: 1.5,
                rightLateral: -0.5,
            },
            geometry: { type: "LineString", coordinates: [[10, 1], [11, 2]] },
        });
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
