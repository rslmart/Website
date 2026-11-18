// Track-semantics rules shared by the map filters and the colour scale.
// Spur tracks duplicate a main track. Missing wind is null, not 0 kt, and
// is not a Saffir-Simpson category.

// Discrete Saffir–Simpson bins, weakest first. Lightness rises at every step
// so stronger wind is lighter on the dark basemap. Neighbours alternate blue
// and gold: those hues stay apart under deuteranopia, which is what the
// category-legend test checks (CIE76 after a Machado 2009 simulation).
export const WIND_CATEGORIES = [
    { min: 0, label: "< 34 kt (TD)", color: [82, 132, 208] },
    { min: 34, label: "34–63 kt (TS)", color: [167, 154, 39] },
    { min: 64, label: "64–82 kt (Cat 1)", color: [132, 172, 240] },
    { min: 83, label: "83–95 kt (Cat 2)", color: [213, 191, 63] },
    { min: 96, label: "96–112 kt (Cat 3)", color: [190, 207, 244] },
    { min: 113, label: "113–136 kt (Cat 4)", color: [254, 222, 82] },
    { min: 137, label: "≥ 137 kt (Cat 5)", color: [232, 238, 249] },
];

const SAFFIR_SIMPSON = [...WIND_CATEGORIES].reverse().map((entry) => [entry.min, entry.color]);

// Neutral gray. Not one of the category colours above.
export const MISSING_WIND_COLOR = [148, 148, 148];
export const MISSING_WIND_LABEL = "No wind";

// Names already used by the status filter, plus the other IBTrACS codes a
// track point can carry. An unknown code is left as-is.
export const STATUS_NAMES = {
    DB: "Disturbance",
    TD: "Tropical Depression",
    TS: "Tropical Storm",
    TY: "Typhoon",
    ST: "Super Typhoon",
    TC: "Tropical Cyclone",
    HU: "Hurricane",
    SD: "Sub-Tropical Depression",
    SS: "Sub-Tropical Storm",
    EX: "Extra-Tropical",
    PT: "Post-Tropical",
    IN: "Inland",
    DS: "Dissipating",
    LO: "Low",
    WV: "Tropical Wave",
    ET: "Extrapolated",
    MD: "Monsoon Depression",
    XX: "Unknown",
};

export function statusName(code) {
    if (!code) return "—";
    return STATUS_NAMES[code] || code;
}

export function formatKnots(wind) {
    if (wind == null || wind === "") return "—";
    return `${wind} kt`;
}

export function formatMillibars(pressure) {
    if (pressure == null || pressure === "") return "—";
    return `${pressure} mb`;
}

export function isSpurTrack(storm) {
    const trackType = storm && storm.track_type;
    return typeof trackType === "string" && trackType.toLowerCase().includes("spur");
}

// Null wind matches no numeric range, including the default 0–190.
// Slider state is a string after the first change; numeric comparison still holds.
export function hasWindInRange(wind, minWind, maxWind) {
    return wind != null && wind >= minWind && wind <= maxWind;
}

export function colorForWind(windspeed) {
    if (windspeed == null) {
        return MISSING_WIND_COLOR.slice();
    }
    for (const [threshold, color] of SAFFIR_SIMPSON) {
        if (windspeed >= threshold) {
            return color.slice();
        }
    }
    return WIND_CATEGORIES[0].color.slice();
}
