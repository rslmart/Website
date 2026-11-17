import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lastDeckProps } from "../test/mocks/deckglReact.jsx";
import { server } from "../test/networkGuard";
import Tectonics, { MAP_STYLES } from "./Tectonics";

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

describe("Tectonics plates layer", () => {
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
});
