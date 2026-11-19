// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    colorForWind,
    formatKnots,
    formatMillibars,
    hasWindInRange,
    isSpurTrack,
    MISSING_WIND_COLOR,
    statusName,
    WIND_CATEGORIES,
} from "./trackSemantics";

const CATEGORY_COLORS = WIND_CATEGORIES.map((entry) => entry.color);

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
        expect(colorForWind(0)).toEqual(WIND_CATEGORIES[0].color);
        expect(colorForWind(33)).toEqual(WIND_CATEGORIES[0].color);
        expect(colorForWind(34)).toEqual(WIND_CATEGORIES[1].color);
        expect(colorForWind(63)).toEqual(WIND_CATEGORIES[1].color);
        expect(colorForWind(64)).toEqual(WIND_CATEGORIES[2].color);
        expect(colorForWind(82)).toEqual(WIND_CATEGORIES[2].color);
        expect(colorForWind(83)).toEqual(WIND_CATEGORIES[3].color);
        expect(colorForWind(95)).toEqual(WIND_CATEGORIES[3].color);
        expect(colorForWind(96)).toEqual(WIND_CATEGORIES[4].color);
        expect(colorForWind(112)).toEqual(WIND_CATEGORIES[4].color);
        expect(colorForWind(113)).toEqual(WIND_CATEGORIES[5].color);
        expect(colorForWind(136)).toEqual(WIND_CATEGORIES[5].color);
        expect(colorForWind(137)).toEqual(WIND_CATEGORIES[6].color);
        // Callers set an alpha channel on the returned array.
        const first = colorForWind(null);
        first[3] = 128;
        expect(colorForWind(null)).toEqual(MISSING_WIND_COLOR);
    });
});

describe("category palette", () => {
    it("uses the previous Saffir-Simpson colours", () => {
        expect(WIND_CATEGORIES.map((entry) => entry.color)).toEqual([
            [94, 186, 255],
            [0, 250, 244],
            [255, 247, 149],
            [255, 216, 33],
            [255, 143, 32],
            [255, 96, 96],
            [196, 100, 217],
        ]);
    });
});

describe("units and status names", () => {
    it("prints knots, millibars, and the full status name", () => {
        expect(formatKnots(70)).toBe("70 kt");
        expect(formatKnots(0)).toBe("0 kt");
        expect(formatKnots(null)).toBe("—");
        expect(formatMillibars(984)).toBe("984 mb");
        expect(formatMillibars(null)).toBe("—");
        expect(statusName("HU")).toBe("Hurricane");
        expect(statusName("EX")).toBe("Extra-Tropical");
        expect(statusName("TD")).toBe("Tropical Depression");
        expect(statusName("")).toBe("—");
        expect(statusName("ZZ")).toBe("ZZ");
    });
});
