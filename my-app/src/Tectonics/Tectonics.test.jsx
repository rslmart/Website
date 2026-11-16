import { act, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
