import React, {useEffect, useMemo, useState} from 'react';
import DeckGL from '@deck.gl/react';
import {MapView} from '@deck.gl/core';
import {GeoJsonLayer, LineLayer} from '@deck.gl/layers';
import {AttributionControl, Map} from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import LegendPanel from './LegendPanel';
import InfoPanel from './InfoPanel';
import HomeButton from '../components/HomeButton';
import ControlsFab from '../components/ControlsFab';
import MobileDrawer from '../components/MobileDrawer';
import useViewport from '../hooks/useViewport';
import useThemeTokens, {cssColorToRgba} from '../hooks/useThemeTokens';
import {isolateMapControls} from '../hooks/mapControls';
import {
    CATEGORIES,
    STEP_CLASS_LABEL,
    categoryForStepClass,
    colorForStepClass,
} from './constants';

// PB2002 data prepared by src/Tectonics/data/build.mjs and served gzipped from
// public/. Fetched and gunzipped at runtime, matching the Hurricane page.
const dataUrl = (name) => process.env.PUBLIC_URL + '/tectonics/' + name;

const loadGz = async (name) => {
    const response = await fetch(dataUrl(name));
    if (!response.ok) {
        throw new Error(`Failed to load ${name} (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    let text;
    if (isGzip && typeof DecompressionStream !== 'undefined') {
        const stream = new Response(buffer).body.pipeThrough(new DecompressionStream('gzip'));
        text = await new Response(stream).text();
    } else {
        text = new TextDecoder().decode(bytes);
    }
    return JSON.parse(text);
};

const INITIAL_VIEW_STATE = {
    longitude: 150,
    latitude: 5,
    zoom: 1.6,
    pitch: 0,
    bearing: 0,
};

// Basemap per site theme. The v11 styles are pinned to Web Mercator below,
// because deck.gl's MapView draws in Web Mercator.
export const MAP_STYLES = {
    light: 'mapbox://styles/mapbox/light-v11',
    dark: 'mapbox://styles/mapbox/dark-v11',
};

// On the light basemap the green ridge and orange transform lines are below
// 3:1 against the land and water, so they get a thin dark casing underneath
// (same hue on top). The other two categories already clear 3:1.
const CASED_CATEGORIES = new Set(['ridge', 'transform']);
const BOUNDARY_WIDTH = 2.5;
const BOUNDARY_MIN_WIDTH = 1.5;
const CASING_EXTRA = 2; // 1px either side

// Draw the deck.gl layers on every world copy the basemap shows. The default
// view is centred on the Pacific (longitude 150), so the Americas and the
// eastern Pacific sit on the copy east of the antimeridian.
const MAP_VIEW = new MapView({repeat: true});

const DEFAULT_VISIBILITY = {
    convergent: true,
    ridge: true,
    transform: true,
    subduction: true,
    orogens: true,
    plates: true,
    velocity: false,
};

// Convert each sampled velocity point into an arrow (shaft + two barbs) drawn
// as short great-ish line segments. Azimuth is degrees clockwise from north;
// length scales with speed (mm/yr). Cosmetic, so a simple planar offset is fine.
const buildVelocityArrows = (points) => {
    const SCALE = 0.05; // degrees of latitude per mm/yr
    const BARB_FRAC = 0.3;
    const BARB_ANGLE = (25 * Math.PI) / 180;
    const segments = [];
    points.forEach((p) => {
        const lenDeg = p.speed * SCALE;
        const az = (p.azimuthDeg * Math.PI) / 180;
        const cosLat = Math.max(Math.cos((p.lat * Math.PI) / 180), 0.2);
        const dLat = Math.cos(az) * lenDeg;
        const dLon = (Math.sin(az) * lenDeg) / cosLat;
        const from = [p.lon, p.lat];
        const tip = [p.lon + dLon, p.lat + dLat];
        segments.push({from, to: tip});
        // Barbs point back from the tip at +/- BARB_ANGLE off the reverse heading.
        const barbLen = lenDeg * BARB_FRAC;
        [az + Math.PI - BARB_ANGLE, az + Math.PI + BARB_ANGLE].forEach((bAz) => {
            const bLat = Math.cos(bAz) * barbLen;
            const bLon = (Math.sin(bAz) * barbLen) / cosLat;
            segments.push({from: tip, to: [tip[0] + bLon, tip[1] + bLat]});
        });
    });
    return segments;
};

function Tectonics() {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);
    const [selectedPlate, setSelectedPlate] = useState(null);
    const [legendOpen, setLegendOpen] = useState(true);
    const [controlsDrawerOpen, setControlsDrawerOpen] = useState(false);
    const { isMobile } = useViewport();
    const {theme, tokens} = useThemeTokens(['--map-ink']);
    const ink = tokens['--map-ink'];

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [plates, boundaries, orogens, velocity] = await Promise.all([
                    loadGz('plates.json.gz'),
                    loadGz('boundaries.json.gz'),
                    loadGz('orogens.json.gz'),
                    loadGz('velocity.json.gz'),
                ]);
                if (cancelled) return;
                setData({plates, boundaries, orogens, velocity});
                setLoading(false);
            } catch (error) {
                console.error(error);
                if (cancelled) return;
                setLoadError(error.message);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const toggle = (key) => setVisibility((prev) => ({...prev, [key]: !prev[key]}));

    // Boundaries filtered to the currently-visible categories.
    const visibleBoundaries = useMemo(() => {
        if (!data) return null;
        return {
            type: 'FeatureCollection',
            features: data.boundaries.features.filter((f) => {
                const cat = categoryForStepClass(f.properties.stepClass);
                return cat && visibility[cat];
            }),
        };
    }, [data, visibility]);

    const casedBoundaries = useMemo(() => {
        if (!visibleBoundaries || theme !== 'light') return null;
        return {
            type: 'FeatureCollection',
            features: visibleBoundaries.features.filter((f) =>
                CASED_CATEGORIES.has(categoryForStepClass(f.properties.stepClass))
            ),
        };
    }, [visibleBoundaries, theme]);

    const velocityArrows = useMemo(
        () => (data ? buildVelocityArrows(data.velocity) : []),
        [data]
    );

    const layers = useMemo(() => {
        if (!data) return [];
        const out = [];

        if (visibility.plates) {
            out.push(
                new GeoJsonLayer({
                    id: 'plates',
                    data: data.plates,
                    stroked: true,
                    filled: true,
                    getFillColor: (f) =>
                        selectedPlate && f.properties.Code === selectedPlate.Code
                            ? [52, 120, 219, 60]
                            : [255, 255, 255, 8],
                    getLineColor: [120, 120, 140, 120],
                    getLineWidth: 1,
                    lineWidthUnits: 'pixels',
                    pickable: true,
                    autoHighlight: true,
                    highlightColor: [52, 120, 219, 40],
                    wrapLongitude: true,
                    onClick: (info) => setSelectedPlate(info.object ? info.object.properties : null),
                    updateTriggers: {getFillColor: [selectedPlate]},
                })
            );
        }

        if (visibility.orogens) {
            out.push(
                new GeoJsonLayer({
                    id: 'orogens',
                    data: data.orogens,
                    stroked: true,
                    filled: true,
                    getFillColor: [150, 140, 120, 70],
                    getLineColor: [150, 140, 120, 130],
                    getLineWidth: 1,
                    lineWidthUnits: 'pixels',
                    wrapLongitude: true,
                    pickable: false,
                })
            );
        }

        if (visibility.velocity) {
            out.push(
                new LineLayer({
                    id: 'velocity',
                    data: velocityArrows,
                    getSourcePosition: (d) => d.from,
                    getTargetPosition: (d) => d.to,
                    getColor: cssColorToRgba(ink, 200, [40, 40, 40, 200]),
                    getWidth: 1.2,
                    widthUnits: 'pixels',
                    wrapLongitude: true,
                    pickable: false,
                })
            );
        }

        if (casedBoundaries) {
            out.push(
                new GeoJsonLayer({
                    id: 'boundaries-casing',
                    data: casedBoundaries,
                    stroked: true,
                    filled: false,
                    getLineColor: cssColorToRgba(ink, 230, [40, 40, 40, 230]),
                    getLineWidth: BOUNDARY_WIDTH + CASING_EXTRA,
                    lineWidthUnits: 'pixels',
                    lineWidthMinPixels: BOUNDARY_MIN_WIDTH + CASING_EXTRA,
                    wrapLongitude: true,
                    pickable: false,
                })
            );
        }

        out.push(
            new GeoJsonLayer({
                id: 'boundaries',
                data: visibleBoundaries,
                stroked: true,
                filled: false,
                getLineColor: (f) => colorForStepClass(f.properties.stepClass),
                getLineWidth: BOUNDARY_WIDTH,
                lineWidthUnits: 'pixels',
                lineWidthMinPixels: BOUNDARY_MIN_WIDTH,
                wrapLongitude: true,
                pickable: true,
                autoHighlight: true,
                // Hover highlight: dark on the light map, light on the dark one.
                highlightColor: cssColorToRgba(ink, 200, [255, 255, 255, 200]),
            })
        );

        return out;
    }, [data, visibility, visibleBoundaries, casedBoundaries, velocityArrows, selectedPlate, ink]);

    // deck.gl applies this inline to its tooltip <div>, so var() works.
    const TOOLTIP_STYLE = {
        fontSize: '12px',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-panel)',
    };

    const getTooltip = ({object, layer}) => {
        if (!object || !layer) return null;
        if (layer.id === 'boundaries') {
            const p = object.properties;
            return {
                html: `<div><b>${STEP_CLASS_LABEL[p.stepClass] || p.stepClass}</b><br/>`
                    + `Plates: ${p.plateBound}<br/>`
                    + `Relative velocity: ${p.velocity} mm/yr</div>`,
                style: TOOLTIP_STYLE,
            };
        }
        if (layer.id === 'plates') {
            return {
                html: `<div><b>${object.properties.PlateName}</b> (${object.properties.Code})</div>`,
                style: TOOLTIP_STYLE,
            };
        }
        return null;
    };

    return (
        <div className="mobile-dvh" style={{width: '100vw', height: '100vh'}}>
            <HomeButton />
            <DeckGL
                views={MAP_VIEW}
                viewState={viewState}
                controller={true}
                onViewStateChange={({viewState: vs}) => setViewState(vs)}
                layers={layers}
                getTooltip={getTooltip}
            >
                <Map
                    reuseMaps
                    mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                    mapStyle={MAP_STYLES[theme]}
                    projection="mercator"
                    attributionControl={false}
                    onLoad={isolateMapControls}
                >
                    {/* On phones the Controls button covers the bottom-right
                        corner, so the attribution moves beside the logo. */}
                    <AttributionControl
                        key={isMobile ? 'mobile' : 'desktop'}
                        position={isMobile ? 'bottom-left' : 'bottom-right'}
                        compact={isMobile ? false : undefined}
                    />
                </Map>
            </DeckGL>

            {(loading || loadError) && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: 'var(--color-surface)',
                        boxShadow: 'var(--shadow-panel)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 20px',
                        fontSize: '14px',
                        color: loadError ? 'var(--color-danger)' : 'var(--color-text-muted)',
                        zIndex: 9999,
                    }}
                >
                    {loadError
                        ? `Could not load tectonic data: ${loadError}`
                        : 'Loading tectonic plate data…'}
                </div>
            )}

            {selectedPlate && (
                isMobile ? (
                    <div className="mobile-sheet">
                        <div className="mobile-sheet-header">
                            <button
                                type="button"
                                className="mobile-sheet-close"
                                onClick={() => setSelectedPlate(null)}
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        </div>
                        <InfoPanel embedded plate={selectedPlate} onClose={() => setSelectedPlate(null)} />
                    </div>
                ) : (
                    <InfoPanel plate={selectedPlate} onClose={() => setSelectedPlate(null)} />
                )
            )}

            {!isMobile && (
                <LegendPanel
                    open={legendOpen}
                    categories={CATEGORIES}
                    visibility={visibility}
                    onToggle={toggle}
                    togglePanel={() => setLegendOpen((prev) => !prev)}
                />
            )}

            {isMobile && (
                <ControlsFab onClick={() => setControlsDrawerOpen(true)} />
            )}
            {isMobile && (
                <MobileDrawer
                    open={controlsDrawerOpen}
                    onClose={() => setControlsDrawerOpen(false)}
                    title="Layers & legend"
                >
                    <LegendPanel
                        embedded
                        categories={CATEGORIES}
                        visibility={visibility}
                        onToggle={toggle}
                    />
                </MobileDrawer>
            )}
        </div>
    );
}

export default Tectonics;
