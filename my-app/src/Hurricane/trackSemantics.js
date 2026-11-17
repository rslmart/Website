// Track-semantics rules shared by the map filters and the colour scale.
// Spur tracks duplicate a main track. Missing wind is null, not 0 kt, and
// is not a Saffir-Simpson category.

const SAFFIR_SIMPSON = [
    [137, [196, 100, 217]],
    [113, [255, 96, 96]],
    [96, [255, 143, 32]],
    [83, [255, 216, 33]],
    [64, [255, 247, 149]],
    [34, [0, 250, 244]],
];

// Neutral gray. Not one of the category colours above, and not the < 34 kt blue.
export const MISSING_WIND_COLOR = [148, 148, 148];

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
    return [94, 186, 255];
}
