// Bird 2002 (PB2002) boundary step classes grouped into the four legend
// categories shown on the reference map, each with an RGB color.

export const CATEGORIES = {
    convergent: {label: 'Convergent boundary', color: [230, 51, 51]},
    ridge: {label: 'Rift / spreading ridge', color: [46, 204, 113]},
    transform: {label: 'Transform fault', color: [230, 145, 34]},
    subduction: {label: 'Subduction zone', color: [52, 120, 219]},
};

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
