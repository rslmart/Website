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

// Machado, Oliveira, and Fernandes 2009, deuteranopia at full severity,
// applied in linear sRGB. CIE76 is Euclidean distance in CIE Lab. The old
// Cat 2 / Cat 3 pair scored about 18 on this path.
const DEUTERANOPIA = [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
];

function linearChannel(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encodeChannel(value) {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return 255 * encoded;
}

function simulateDeuteranopia(rgb) {
    const [red, green, blue] = rgb.map(linearChannel);
    return DEUTERANOPIA.map((row) => encodeChannel(row[0] * red + row[1] * green + row[2] * blue));
}

function lab(rgb) {
    const [red, green, blue] = rgb.map(linearChannel);
    const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
    const y = red * 0.2126729 + green * 0.7151522 + blue * 0.0721750;
    const z = red * 0.0193339 + green * 0.1191920 + blue * 0.9503041;
    const pivot = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
    const fx = pivot(x / 0.95047);
    const fy = pivot(y);
    const fz = pivot(z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(first, second) {
    const [l1, a1, b1] = lab(first);
    const [l2, a2, b2] = lab(second);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe("category palette", () => {
    it("raises lightness at every step and keeps neighbours 25 ΔE apart under deuteranopia", () => {
        const lightness = WIND_CATEGORIES.map((entry) => lab(entry.color)[0]);
        for (let i = 0; i < lightness.length - 1; i += 1) {
            expect(lightness[i + 1]).toBeGreaterThan(lightness[i]);
            const gap = deltaE76(
                simulateDeuteranopia(WIND_CATEGORIES[i].color),
                simulateDeuteranopia(WIND_CATEGORIES[i + 1].color),
            );
            expect(gap).toBeGreaterThanOrEqual(25);
        }
        for (const entry of WIND_CATEGORIES) {
            expect(deltaE76(simulateDeuteranopia(entry.color), simulateDeuteranopia(MISSING_WIND_COLOR))).toBeGreaterThanOrEqual(25);
        }
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
