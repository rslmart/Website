import React, {useEffect, useMemo, useRef, useState} from 'react';
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

// Desktop and landscape keep this zoom. A 390px-wide phone at zoom 1.6 shows
// about 90° of longitude (360 × width / (512 × 2^zoom)).
export const DESKTOP_ZOOM = 1.6;
// Acceptance is 300°. 330° still clears 300° if the canvas is a few pixels
// narrower than the window (scrollbar, safe area).
export const PHONE_PORTRAIT_LONGITUDE_SPAN = 330;
// deck.gl / mapbox Web Mercator world size at zoom 0.
export const MERCATOR_TILE_SIZE = 512;
// MapController defaults minZoom to 0 and, with normalize, raises zoom to
// log2(height/512) so the map fills a tall screen. Either clamp pulls a
// portrait phone back under 300°. Relax both; the wide view is the point.
export const MAP_CONTROLLER = {minZoom: -2, maxZoom: 20, normalize: false};

// .controls-fab is 48×48 and 16px from the right (global.css). This inset
// leaves that column, plus a 12px gap, clear of the plate sheet.
export const PLATE_SHEET_RIGHT_INSET =
    'calc(16px + 48px + 12px + env(safe-area-inset-right, 0px))';

export const MAPBOX_TOKEN_MESSAGE =
    'Map tiles are unavailable. The Mapbox access token is missing or invalid.';

// The shared landscape rule sets the drawer to 96dvh, so it covers the map.
// Keep this page's drawer in the bottom 46% and let taps pass through to the
// map above it. MobileDrawer.jsx itself is unchanged.
export const TECTONICS_LAYOUT_CSS = `
@media (max-width: 900px) and (max-height: 480px) {
  .tectonics-page .mobile-drawer-overlay {
    top: 54dvh;
    background: transparent;
    pointer-events: none;
  }
  .tectonics-page .mobile-drawer {
    max-height: 100%;
    pointer-events: auto;
  }
}
`;

export function isPhonePortrait(width, height) {
    return width > 0 && width <= 768 && height > width;
}

/** Degrees of longitude across `width` CSS pixels at `zoom`. Pitch and bearing are 0. */
export function longitudeSpanDegrees(width, zoom) {
    if (!(width > 0) || !Number.isFinite(zoom)) return 0;
    return (360 * width) / (MERCATOR_TILE_SIZE * 2 ** zoom);
}

export function zoomForLongitudeSpan(width, spanDegrees) {
    return Math.log2((360 * width) / (spanDegrees * MERCATOR_TILE_SIZE));
}

export function defaultViewState(width, height) {
    const zoom = isPhonePortrait(width, height)
        ? zoomForLongitudeSpan(width, PHONE_PORTRAIT_LONGITUDE_SPAN)
        : DESKTOP_ZOOM;
    return {longitude: 150, latitude: 5, zoom, pitch: 0, bearing: 0};
}

// Missing token, or a Mapbox error that is the token being rejected.
export function mapboxTokenFailed(token, error) {
    if (token == null || String(token).trim() === '') return true;
    if (!error) return false;
    const status = error.status ?? error.error?.status;
    const message = `${error.message || ''} ${error.error?.message || ''}`;
    return status === 401 || status === 403
        || /access token|unauthorized|not authorized|invalid token/i.test(message);
}

const readWindowSize = () => (
    typeof window === 'undefined'
        ? {width: 0, height: 0}
        : {width: window.innerWidth, height: window.innerHeight}
);

// Basemap per site theme. v10, not v11: the v11 styles use fog/globe
// properties that mapbox-gl 2.8.2 rejects (console errors, and the switch to
// dark silently failed in the Conductor's check with a token, 2026-11-17).
// Moving to v11 needs a mapbox-gl upgrade. Pinned to Web Mercator below,
// because deck.gl's MapView draws in Web Mercator.
export const MAP_STYLES = {
    light: 'mapbox://styles/mapbox/light-v10',
    dark: 'mapbox://styles/mapbox/dark-v10',
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

function tooltipModel(info) {
    const object = info?.object;
    const layer = info?.layer;
    if (!object || !layer) return null;
    if (layer.id === 'boundaries') {
        const p = object.properties;
        return {
            title: STEP_CLASS_LABEL[p.stepClass] || p.stepClass,
            lines: [`Plates: ${p.plateBound}`, `Relative velocity: ${p.velocity} mm/yr`],
        };
    }
    if (layer.id === 'plates') {
        const p = object.properties;
        return {title: p.PlateName, lines: [p.Code]};
    }
    return null;
}

function Tectonics() {
    const rootRef = useRef(null);
    const userMovedRef = useRef(false);
    const [measured, setMeasured] = useState(readWindowSize);
    const [viewState, setViewState] = useState(() => {
        const {width, height} = readWindowSize();
        return defaultViewState(width, height);
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [mapError, setMapError] = useState(null);
    const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);
    const [selectedPlate, setSelectedPlate] = useState(null);
    const [tapTip, setTapTip] = useState(null);
    const [legendOpen, setLegendOpen] = useState(true);
    const [controlsDrawerOpen, setControlsDrawerOpen] = useState(false);
    const { isMobile } = useViewport();
    const tokenFailed = mapboxTokenFailed(import.meta.env.VITE_MAPBOX_TOKEN, mapError);
    const {theme, tokens} = useThemeTokens(['--map-ink']);
    const ink = tokens['--map-ink'];

    // Refit until the user pans or zooms, so a resize into phone portrait
    // (and the preview viewport) lands on the wide view.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;
        const fit = () => {
            if (userMovedRef.current) return;
            const width = root.clientWidth;
            const height = root.clientHeight;
            if (width < 1 || height < 1) return;
            const next = defaultViewState(width, height);
            setMeasured({width, height});
            setViewState((prev) => (
                prev.zoom === next.zoom && prev.longitude === next.longitude && prev.latitude === next.latitude
                    ? prev
                    : next
            ));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(root);
        return () => observer.disconnect();
    }, []);

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
                    // No outline: the plate rings include artificial edges on
                    // lon ±180 and along the poles (a visible seam), and the
                    // boundaries layer already draws every real plate edge.
                    // The selected plate shows by fill.
                    stroked: false,
                    filled: true,
                    getFillColor: (f) =>
                        selectedPlate && f.properties.Code === selectedPlate.Code
                            ? [52, 120, 219, 60]
                            : [255, 255, 255, 8],
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

    // Hover tooltips stick after a tap (no pointer leave). Phones use a
    // click tooltip with an explicit dismiss instead.
    const getTooltip = (info) => {
        if (isMobile) return null;
        const model = tooltipModel(info);
        if (!model) return null;
        if (info.layer.id === 'plates') {
            return {
                html: `<div><b>${model.title}</b> (${model.lines[0]})</div>`,
                style: TOOLTIP_STYLE,
            };
        }
        return {
            html: `<div><b>${model.title}</b><br/>${model.lines.join('<br/>')}</div>`,
            style: TOOLTIP_STYLE,
        };
    };

    const onMapClick = (info) => {
        if (!isMobile) return;
        const model = tooltipModel(info);
        setTapTip((current) => {
            if (!model) return null;
            if (current && current.object === info.object && current.layerId === info.layer.id) return null;
            return {...model, object: info.object, layerId: info.layer.id, x: info.x, y: info.y};
        });
    };

    const onViewStateChange = ({viewState: vs, interactionState}) => {
        const interacting = Boolean(
            interactionState?.isDragging || interactionState?.isPanning
            || interactionState?.isZooming || interactionState?.isRotating
        );
        if (interacting) {
            userMovedRef.current = true;
            setTapTip(null);
        }
        setViewState(vs);
    };

    const onMapError = (event) => {
        const error = event?.error || event;
        if (mapboxTokenFailed(import.meta.env.VITE_MAPBOX_TOKEN, error)) setMapError(error);
    };

    const longitudeSpan = longitudeSpanDegrees(measured.width, viewState.zoom);

    return (
        <div
            ref={rootRef}
            className="tectonics-page mobile-dvh"
            data-view-zoom={viewState.zoom}
            data-longitude-span={longitudeSpan.toFixed(2)}
            style={{width: '100vw', height: '100vh'}}
        >
            <style>{TECTONICS_LAYOUT_CSS}</style>
            <HomeButton />
            <DeckGL
                views={MAP_VIEW}
                viewState={viewState}
                controller={MAP_CONTROLLER}
                onViewStateChange={onViewStateChange}
                onClick={onMapClick}
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
                    onError={onMapError}
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

            {tokenFailed && (
                <div
                    role="status"
                    style={{
                        position: 'absolute',
                        top: 68,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        maxWidth: 'calc(100% - 32px)',
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border-strong)',
                        boxShadow: 'var(--shadow-panel)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        fontSize: '14px',
                        lineHeight: 1.4,
                        textAlign: 'center',
                        zIndex: 10002,
                    }}
                >
                    {MAPBOX_TOKEN_MESSAGE}
                </div>
            )}

            {isMobile && tapTip && (
                <div
                    role="tooltip"
                    style={{
                        position: 'absolute',
                        left: tapTip.x ?? 0,
                        top: tapTip.y ?? 0,
                        transform: 'translate(-50%, calc(-100% - 12px))',
                        zIndex: 10002,
                        pointerEvents: 'auto',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        ...TOOLTIP_STYLE,
                    }}
                >
                    <div>
                        <b>{tapTip.title}</b>
                        {tapTip.layerId === 'plates'
                            ? ` (${tapTip.lines[0]})`
                            : tapTip.lines.map((line) => <div key={line}>{line}</div>)}
                    </div>
                    <button
                        type="button"
                        aria-label="Dismiss tooltip"
                        onClick={() => setTapTip(null)}
                        style={{
                            border: 'none',
                            background: 'none',
                            color: 'inherit',
                            fontSize: 20,
                            lineHeight: 1,
                            cursor: 'pointer',
                            padding: '0 2px',
                        }}
                    >
                        ×
                    </button>
                </div>
            )}

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
                    <div className="mobile-sheet" style={{right: PLATE_SHEET_RIGHT_INSET}}>
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
