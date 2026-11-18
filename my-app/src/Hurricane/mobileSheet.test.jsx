import { fireEvent, render, screen } from "@testing-library/react";
import { WebMercatorViewport } from "@deck.gl/core";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import FilterPanel from "./filter-panel";
import { PLOT_TYPES, mobileSheetMaxHeight, mobileStormPadding } from "./Hurricane";
import SettingsPanel from "./settings-panel";
import StormInfo, { buildIrCandidateUrls } from "./storm-info";
import { server } from "../test/networkGuard";

const early = {
    id: "1900252N27230",
    name: "GALVESTON",
    season: 1900,
    provisional: true,
    track_points: [
        { date_time: "1900-09-08 00:00:00", wind: null, pressure: null },
        { date_time: "1900-09-08 06:00:00", wind: 40, pressure: 980 },
    ],
};

const modern = {
    id: "2024225N17312",
    name: "ERNESTO",
    season: 2024,
    atcf_id: "AL052024",
    track_points: [
        { date_time: "2024-08-12 12:00:00", wind: 65, pressure: 990 },
    ],
};

const scatterplotSettings = {
    name: "scatterplotSettings",
    radiusScale: 3,
    radiusMinPixels: 4,
    radiusMaxPixels: 100,
    lineWidthScale: 2,
    lineWidthMinPixels: 2,
    lineWidthMaxPixels: 100,
};
const lineSettings = { name: "lineSettings", widthScale: 1, widthMinPixels: 0, widthMaxPixels: 100 };
const gridSettings = { name: "gridSettings", cellSize: 100000, elevationScale: 300 };
const heatmapSettings = { name: "heatmapSettings", radiusPixels: 50, intensity: 1, threshold: 0.1 };

function renderStorm(storm, extra = {}) {
    return render(
        <StormInfo
            stormInfo={storm}
            selectedPoint={0}
            onChange={() => {}}
            exitStormInfo={() => {}}
            {...extra}
        />
    );
}

describe("phone storm sheet", () => {
    it("caps the sheet below half the screen and pads the map by that share", () => {
        expect(mobileSheetMaxHeight(false)).toBe("40dvh");
        expect(mobileSheetMaxHeight(true)).toBe("36dvh");
        const portrait = mobileStormPadding({ isShort: false, collapsed: false, height: 844 });
        const landscape = mobileStormPadding({ isShort: true, collapsed: false, height: 390 });
        expect(portrait.bottom).toBe(Math.round(844 * 0.4));
        expect(landscape.bottom).toBe(Math.round(390 * 0.36));
        expect(portrait.bottom).toBeLessThan(844 / 2);
        expect(landscape.bottom).toBeLessThan(390 / 2);
        const collapsed = mobileStormPadding({ isShort: false, collapsed: true, height: 844 });
        expect(collapsed.bottom).toBeLessThan(120);
    });

    it("fits a selected track into the map above the sheet", () => {
        const place = (width, height, isShort) => {
            const padding = mobileStormPadding({ isShort, collapsed: false, height });
            const fitted = new WebMercatorViewport({ width, height, longitude: 0, latitude: 0, zoom: 1 })
                .fitBounds([[-95, 23], [-80, 31]], { padding });
            const view = new WebMercatorViewport({
                width,
                height,
                longitude: fitted.longitude,
                latitude: fitted.latitude,
                zoom: fitted.zoom,
            });
            const sheetTop = height - padding.bottom;
            for (const point of [[-95, 23], [-80, 31], [-87, 27]]) {
                const [, y] = view.project(point);
                expect(y).toBeGreaterThanOrEqual(padding.top - 1);
                expect(y).toBeLessThanOrEqual(sheetTop + 1);
            }
        };
        place(390, 844, false);
        place(844, 390, true);
    });

    it("collapses to the title row and keeps 44px controls", () => {
        const { rerender } = renderStorm(early, { embedded: true, collapsed: false, onToggleCollapsed: () => {} });
        expect(screen.getByRole("button", { name: "Collapse storm details" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("No imagery")).toBeInTheDocument();
        for (const name of ["Collapse storm details", "Close storm details", "Previous track point", "Next track point"]) {
            const button = screen.getByRole("button", { name });
            expect(button.style.minHeight).toBe("44px");
            expect(button.style.minWidth).toBe("44px");
        }
        expect(screen.getByRole("slider").style.minHeight).toBe("44px");
        rerender(
            <StormInfo
                embedded
                collapsed
                stormInfo={early}
                selectedPoint={0}
                onChange={() => {}}
                exitStormInfo={() => {}}
                onToggleCollapsed={() => {}}
            />
        );
        expect(screen.getByRole("button", { name: "Expand storm details" })).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("No imagery")).not.toBeInTheDocument();
        expect(screen.queryByText("Date/Time: 1900-09-08 00:00:00")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /GALVESTON 1900/ })).toHaveTextContent("Provisional");
    });
});

describe("satellite imagery states", () => {
    beforeEach(() => {
        server.use(
            http.get("https://rammb-data.cira.colostate.edu/*", () => new HttpResponse(null, { status: 404 })),
            http.get("https://makoa.link/*", () => new HttpResponse(null, { status: 404 }))
        );
    });

    it("says there is no imagery for a storm before the satellite record", () => {
        renderStorm(early);
        expect(screen.getByRole("status")).toHaveTextContent("No imagery");
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.getByText(/Wind:/)).toHaveTextContent("—");
        expect(screen.getByRole("heading")).toHaveTextContent("Provisional");
    });

    it("shows a loading state, then no imagery once every frame fails", () => {
        renderStorm(modern);
        expect(screen.getByRole("status")).toHaveTextContent("Loading imagery…");
        let steps = 0;
        while (screen.queryByText("No imagery") == null && steps < 30) {
            const img = document.querySelector("img");
            expect(img).toBeTruthy();
            fireEvent.error(img);
            steps += 1;
        }
        expect(steps).toBeGreaterThan(1);
        expect(screen.getByRole("status")).toHaveTextContent("No imagery");
        expect(document.querySelector("img")).toBeNull();
    });

    it("shows the frame when a candidate loads", () => {
        renderStorm(modern);
        const img = document.querySelector("img");
        expect(img.getAttribute("src")).toContain("2024al05_4kmirimg_202408121200.gif");
        fireEvent.load(img);
        expect(screen.queryByText("Loading imagery…")).not.toBeInTheDocument();
        expect(screen.getByRole("img")).toBeVisible();
    });

    it("leaves loading behind when the next point is selected after a miss", () => {
        const two = {
            ...modern,
            track_points: [
                modern.track_points[0],
                { date_time: "2024-08-12 18:00:00", wind: 70, pressure: 985 },
            ],
        };
        const { rerender } = renderStorm(two);
        let steps = 0;
        while (screen.queryByText("No imagery") == null && steps < 30) {
            fireEvent.error(document.querySelector("img"));
            steps += 1;
        }
        expect(screen.getByRole("status")).toHaveTextContent("No imagery");
        rerender(
            <StormInfo
                stormInfo={two}
                selectedPoint={1}
                onChange={() => {}}
                exitStormInfo={() => {}}
            />
        );
        expect(screen.getByRole("status")).toHaveTextContent("Loading imagery…");
        expect(document.querySelector("img").getAttribute("src")).toContain("202408121800");
    });
});

describe("imagery URLs", () => {
    it("builds the RAMMB gif for ISAIAS 2026 and for a frame that exists", () => {
        const isaias = buildIrCandidateUrls(
            { season: 2026, atcf_id: "AL092026", id: "2026278N22264" },
            { date_time: "2026-10-08 09:00:00" }
        );
        expect(isaias[0]).toBe(
            "https://rammb-data.cira.colostate.edu/tc_realtime/products/storms/2026al09/4kmirimg/2026al09_4kmirimg_202610080900.gif"
        );
        const southern = buildIrCandidateUrls(
            { season: 2020, atcf_id: "SH012020", id: "2019329S15113" },
            { date_time: "2019-11-25 12:00:00" }
        );
        expect(southern[0]).toBe(
            "https://rammb-data.cira.colostate.edu/tc_realtime/products/storms/2020sh01/4kmirimg/2020sh01_4kmirimg_201911251200.gif"
        );
        expect(southern.length).toBeGreaterThan(1);
        expect(buildIrCandidateUrls({ season: 1900, id: "1900252N27230" }, { date_time: "1900-09-08 00:00:00" })).toEqual([]);
    });
});

describe("phone controls", () => {
    it("gives the Name field type text", () => {
        render(
            <FilterPanel
                filterPanelOpen
                plotType="Storm"
                plotTypeOptions={{ STORM: "Storm" }}
                basin="ALL"
                basinOptions={{ ALL: "All" }}
                name=""
                systemStatus="None"
                systemStatusOptions={{ None: "" }}
                minYear={1}
                maxYear={9}
                seasonMin={1}
                seasonMax={9}
                minMonth={1}
                maxMonth={12}
                minWind={0}
                maxWind={190}
                filterByPressure={false}
                minPressure={870}
                maxPressure={1024}
                landfall={false}
                showSpurs={false}
                showMaxWindPoly={false}
                showWindPoly={false}
                only6Hour={false}
                onChange={() => {}}
                toggleFilterPanel={() => {}}
            />
        );
        expect(document.querySelector('input[name="name"]')).toHaveAttribute("type", "text");
    });

    it("uses readable 16px labels and 44px inputs for rendering settings", () => {
        render(
            <SettingsPanel
                embedded
                plotType={PLOT_TYPES.STORM}
                onSettingsChange={() => {}}
                scatterplotSettings={scatterplotSettings}
                lineSettings={lineSettings}
                gridSettings={gridSettings}
                heatmapSettings={heatmapSettings}
            />
        );
        expect(screen.queryByText(/radiusScale/)).not.toBeInTheDocument();
        expect(screen.queryByText(/lineWidthMinPixels/)).not.toBeInTheDocument();
        const pointSize = screen.getByRole("spinbutton", { name: "Point size" });
        expect(pointSize.style.minHeight).toBe("44px");
        expect(pointSize.style.fontSize).toBe("16px");
        expect(screen.getByText("Minimum point size (px)")).toHaveStyle({ fontSize: "16px" });
        expect(screen.getByRole("spinbutton", { name: "Line width" })).toBeInTheDocument();
    });
});
