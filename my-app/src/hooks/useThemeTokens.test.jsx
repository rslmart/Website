import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import useThemeTokens, { cssColorToRgba } from "./useThemeTokens";

function Probe() {
    const { theme, tokens } = useThemeTokens(["--map-ink", "--chart-reference"]);
    return <output data-testid="probe">{`${theme} ${tokens["--map-ink"]} ${tokens["--chart-reference"]}`}</output>;
}

describe("useThemeTokens", () => {
    let sheet;
    beforeEach(() => {
        sheet = document.createElement("style");
        sheet.textContent = `
            :root { --map-ink: #282828; --chart-reference: #555555; }
            :root[data-theme="dark"] { --map-ink: #DADDD8; --chart-reference: #8F958E; }`;
        document.head.appendChild(sheet);
        document.documentElement.dataset.theme = "light";
    });
    afterEach(() => {
        sheet.remove();
        delete document.documentElement.dataset.theme;
    });

    it("reads the tokens for the current theme and re-renders when it changes", async () => {
        render(<Probe />);
        expect(screen.getByTestId("probe")).toHaveTextContent("light #282828 #555555");

        await act(async () => {
            document.documentElement.dataset.theme = "dark";
        });
        expect(screen.getByTestId("probe")).toHaveTextContent("dark #DADDD8 #8F958E");

        await act(async () => {
            document.documentElement.dataset.theme = "light";
        });
        expect(screen.getByTestId("probe")).toHaveTextContent("light #282828 #555555");
    });
});

describe("cssColorToRgba", () => {
    it("parses hex and rgb() colours into deck.gl arrays", () => {
        expect(cssColorToRgba("#282828", 200)).toEqual([40, 40, 40, 200]);
        expect(cssColorToRgba("#fff")).toEqual([255, 255, 255, 255]);
        expect(cssColorToRgba("rgb(22, 101, 52)", 10)).toEqual([22, 101, 52, 10]);
        expect(cssColorToRgba("", 9, [1, 2, 3, 9])).toEqual([1, 2, 3, 9]);
    });
});
