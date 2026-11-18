import { describe, expect, it } from "vitest";
import { colorForWind } from "./trackSemantics";
import { scatterFillColor, scatterStrokeColor } from "./Hurricane";

describe("selected track point colour", () => {
    it("marks the selected point white and keeps every other point visible", () => {
        const wind = 70;
        const [red, green, blue] = colorForWind(wind);
        const selected = scatterFillColor(wind, "selected");
        const dimmed = scatterFillColor(wind, "dimmed");
        const plain = scatterFillColor(wind, "plain");

        expect(selected).toEqual([255, 255, 255, 255]);
        expect(dimmed).toEqual([red, green, blue, 128]);
        expect(plain).toEqual([red, green, blue, 255]);
        for (const color of [selected, dimmed, plain]) {
            expect(color).toHaveLength(4);
            expect(color[3]).toBeGreaterThan(0);
        }
        expect(scatterStrokeColor(wind, true)).toEqual([red, green, blue, 255]);
        expect(scatterStrokeColor(wind, false)).toEqual([0, 0, 0, 0]);

        const again = scatterFillColor(wind, "dimmed");
        again[3] = 0;
        expect(scatterFillColor(wind, "dimmed")[3]).toBe(128);
    });
});
