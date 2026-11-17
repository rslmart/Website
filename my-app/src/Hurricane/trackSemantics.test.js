// @vitest-environment node
import { describe, expect, it } from "vitest";
import { colorForWind, hasWindInRange, isSpurTrack, MISSING_WIND_COLOR } from "./trackSemantics";

const CATEGORY_COLORS = [
    [196, 100, 217],
    [255, 96, 96],
    [255, 143, 32],
    [255, 216, 33],
    [255, 247, 149],
    [0, 250, 244],
    [94, 186, 255],
];

describe("isSpurTrack", () => {
    it("matches every IBTrACS spur track_type and ignores main and provisional", () => {
        expect(isSpurTrack({ track_type: "spur-merge" })).toBe(true);
        expect(isSpurTrack({ track_type: "spur-split" })).toBe(true);
        expect(isSpurTrack({ track_type: "spur-other" })).toBe(true);
        expect(isSpurTrack({ track_type: "US-PROVISIONAL_spur" })).toBe(true);
        expect(isSpurTrack({ track_type: "main" })).toBe(false);
        expect(isSpurTrack({ track_type: "PROVISIONAL" })).toBe(false);
        expect(isSpurTrack({ track_type: "US-PROVISIONAL" })).toBe(false);
        expect(isSpurTrack({})).toBe(false);
        expect(isSpurTrack(null)).toBe(false);
    });
});

describe("hasWindInRange", () => {
    it("rejects null wind and keeps a reported 0 inside the default range", () => {
        expect(hasWindInRange(null, 0, 190)).toBe(false);
        expect(hasWindInRange(undefined, 0, 190)).toBe(false);
        expect(hasWindInRange(0, 0, 190)).toBe(true);
        expect(hasWindInRange(0, 5, 190)).toBe(false);
        expect(hasWindInRange(70, 0, 190)).toBe(true);
        expect(hasWindInRange(70, "0", "190")).toBe(true);
        expect(hasWindInRange(200, 0, 190)).toBe(false);
    });
});

describe("colorForWind", () => {
    it("keeps a missing wind off the Saffir-Simpson scale", () => {
        expect(colorForWind(null)).toEqual(MISSING_WIND_COLOR);
        expect(colorForWind(undefined)).toEqual(MISSING_WIND_COLOR);
        for (const category of CATEGORY_COLORS) {
            expect(colorForWind(null)).not.toEqual(category);
        }
        expect(colorForWind(0)).toEqual([94, 186, 255]);
        expect(colorForWind(137)).toEqual([196, 100, 217]);
        // Callers set an alpha channel on the returned array.
        const first = colorForWind(null);
        first[3] = 128;
        expect(colorForWind(null)).toEqual(MISSING_WIND_COLOR);
    });
});
