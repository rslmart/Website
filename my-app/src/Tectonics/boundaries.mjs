// Columnar PB2002 boundaries. Property names are stored once; each step is a
// parallel row. `coordinates` is a GeoJSON LineString position list, or a
// MultiLineString part list when the step was split at ±180.
//
// Bird's file numbers steps 1..5819 with no gaps. A contiguous run is stored
// as `seq0` (the first SEQNUM) and row i is seq0 + i. A gap stores `seq`.

export function toColumnar(collection) {
    const seq = [];
    const stepClass = [];
    const plateBound = [];
    const velocity = [];
    const azimuth = [];
    const divergence = [];
    const rightLateral = [];
    const coordinates = [];
    for (const feature of collection.features) {
        const p = feature.properties;
        seq.push(p.seq);
        stepClass.push(p.stepClass);
        plateBound.push(p.plateBound);
        velocity.push(p.velocity);
        azimuth.push(p.azimuth);
        divergence.push(p.divergence);
        rightLateral.push(p.rightLateral);
        coordinates.push(feature.geometry.coordinates);
    }
    const contiguous = seq.length > 0 && seq.every((value, i) => value === seq[0] + i);
    const columns = {stepClass, plateBound, velocity, azimuth, divergence, rightLateral, coordinates};
    return contiguous ? {seq0: seq[0], ...columns} : {seq, ...columns};
}

function isMultiLine(coordinates) {
    return Array.isArray(coordinates[0]?.[0]);
}

// A FeatureCollection is returned unchanged so the page tests can still serve
// the expanded shape. The published file is columnar.
export function fromColumnar(data) {
    if (data?.type === 'FeatureCollection') return data;
    const features = data.stepClass.map((stepClass, i) => {
        const coordinates = data.coordinates[i];
        const seq = data.seq ? data.seq[i] : data.seq0 + i;
        return {
            type: 'Feature',
            properties: {
                seq,
                stepClass,
                plateBound: data.plateBound[i],
                velocity: data.velocity[i],
                azimuth: data.azimuth[i],
                divergence: data.divergence[i],
                rightLateral: data.rightLateral[i],
            },
            geometry: {
                type: isMultiLine(coordinates) ? 'MultiLineString' : 'LineString',
                coordinates,
            },
        };
    });
    return {type: 'FeatureCollection', features};
}

export function longitudeSpans(feature) {
    const lines = feature.geometry.type === 'MultiLineString'
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];
    const spans = [];
    for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
            spans.push(Math.abs(line[i][0] - line[i - 1][0]));
        }
    }
    return spans;
}
