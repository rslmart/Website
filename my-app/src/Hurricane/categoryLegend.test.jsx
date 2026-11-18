import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CategoryLegend, { categoryLegendStyle } from "./category-legend";
import HelpPanel from "./help-panel";
import { WIND_CATEGORIES } from "./trackSemantics";

describe("on-map category legend", () => {
    it("lists every category and the no-wind swatch", () => {
        render(<CategoryLegend />);
        const legend = screen.getByRole("region", { name: "Wind category legend" });
        for (const entry of WIND_CATEGORIES) {
            expect(legend).toHaveTextContent(entry.label);
        }
        expect(legend).toHaveTextContent("No wind");
    });

    it("stays on screen at phone width and clears the desktop filter column", () => {
        const phone = categoryLegendStyle(true);
        const desktop = categoryLegendStyle(false);
        expect(phone.top).toContain("64px");
        expect(phone.maxWidth).toBe("calc(100vw - 24px)");
        expect(desktop.maxWidth).toBe("calc(100vw - 400px)");
        expect(desktop.position).toBe("absolute");
    });
});

describe("help text", () => {
    it("describes clicks, scatter points, and where Settings lives", () => {
        render(<HelpPanel open onOpen={() => {}} onClose={() => {}} />);
        expect(screen.getByText(/Click a point to open that storm/)).toBeInTheDocument();
        expect(screen.getByText(/The line itself is not clickable/)).toBeInTheDocument();
        expect(screen.getByText(/including fixes between the 6-hour times/)).toBeInTheDocument();
        expect(screen.getByText(/Scatter dots do not open the storm panel/)).toBeInTheDocument();
        expect(screen.getByText(/Settings \+/)).toBeInTheDocument();
        expect(screen.getAllByText(/Controls drawer/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Show spur tracks/)).toBeInTheDocument();
        expect(screen.queryByText(/landfall/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/6-hourly track point/)).not.toBeInTheDocument();
    });
});
