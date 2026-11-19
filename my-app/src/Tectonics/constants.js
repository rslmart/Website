// Bird 2002 (PB2002) boundary step classes grouped into the four legend
// categories. Each colour clears 3:1 against light-v10 ocean 204,210,211
// (WCAG 2.x) and stays more than 40 CIE76 ΔE from the others under simulated
// deuteranopia and protanopia. `dash` is a pixel run [on, off, ...]; null is
// a solid stroke. Tectonics.jsx draws those runs as line segments.

export const CATEGORIES = {
    convergent: {label: 'Convergent boundary', color: [72, 0, 252], dash: null},
    ridge: {label: 'Rift / spreading ridge', color: [0, 96, 84], dash: [14, 7]},
    transform: {label: 'Transform fault', color: [112, 114, 0], dash: [3, 5]},
    subduction: {label: 'Subduction zone', color: [0, 108, 192], dash: [12, 4, 3, 4]},
};

// Teeth sit on the overriding side of a SUB step. Spacing and length are
// pixels at the current zoom, the same way the velocity barbs are sized.
export const TOOTH_SPACING_PX = 16;
export const TOOTH_LENGTH_PX = 7;

// STEPCLASS code -> category key.
export const STEP_CLASS_CATEGORY = {
    CCB: 'convergent',
    OCB: 'convergent',
    CRB: 'ridge',
    OSR: 'ridge',
    CTF: 'transform',
    OTF: 'transform',
    SUB: 'subduction',
};

// STEPCLASS code -> human readable name (for tooltips).
export const STEP_CLASS_LABEL = {
    CCB: 'Continental convergent boundary',
    OCB: 'Oceanic convergent boundary',
    CRB: 'Continental rift boundary',
    OSR: 'Oceanic spreading ridge',
    CTF: 'Continental transform fault',
    OTF: 'Oceanic transform fault',
    SUB: 'Subduction zone',
};

export const categoryForStepClass = (stepClass) => STEP_CLASS_CATEGORY[stepClass];
export const colorForStepClass = (stepClass) => {
    const cat = STEP_CLASS_CATEGORY[stepClass];
    return cat ? CATEGORIES[cat].color : [150, 150, 150];
};
