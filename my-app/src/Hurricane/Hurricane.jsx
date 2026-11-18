import React, {Component} from 'react';
import DeckGL from '@deck.gl/react';
import {GridLayer, HeatmapLayer} from '@deck.gl/aggregation-layers';
import {BitmapLayer, LineLayer, PolygonLayer, ScatterplotLayer} from '@deck.gl/layers';
import {WebMercatorViewport} from '@deck.gl/core';
import {AttributionControl, Map} from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import FilterPanel from "./filter-panel";
import SettingsPanel from "./settings-panel";
import StormInfo from "./storm-info";
import SourcesPanel from "./sources-panel";
import HelpPanel from "./help-panel";
import HomeButton from "../components/HomeButton";
import ControlsFab from "../components/ControlsFab";
import MobileDrawer from "../components/MobileDrawer";
import { withViewport } from "../hooks/useViewport";
import { isolateMapControls } from "../hooks/mapControls";
import CategoryLegend from "./category-legend";
import { colorForWind, formatKnots, formatMillibars, hasWindInRange, isSpurTrack, statusName } from "./trackSemantics";

const HELP_SEEN_KEY = "hurricaneHelpSeen";

/*
/Settings
Layers
    Trackpoint
        /Scatterplot
        /Heatmap
        //GridLayer/HexagonLayer
            /Number of points (heatmap)
            /Max Wind
            /Min Pressure
    /Storms
        /Storm display
            /Graph of storm winds/pressure
            Link to storm
        /LineLayer
        /Wind Radii
Filters
    /Basin
    /Year
    /Month
    /Wind
    /Pressure - when enabled filter out all points wihtout pressure
    /6 hour points
    //Record Type (for storms make this a list)
        According to HURDAT only the landfall identifier is really useful, all others are only included after 1989
        and at the discretion of whoever did the analysis
    /Landfall
    Latitude
        For storms
            max/min
            start/end
    Longitude
    /Status (for storms make this a list of all statuses achieved by the storm)
    Search in polygon
    Search in distance from point
    Wind Radii
 */

// The basemap stays dark in both site themes (user ruling 2026-11-17): the
// category colours are tuned against it. Still dark-v9, not dark-v11; see
// the Hurricane README (Map style).
export const MAP_STYLE = "mapbox://styles/mapbox/dark-v9";

// The shared sheet is 72dvh (88dvh on a short screen) and covers the track.
// These caps leave the upper map clear; fit padding below uses the same shares.
export function mobileSheetMaxHeight(isShort) {
    return isShort ? "36dvh" : "40dvh";
}

// Bottom inset matches the open sheet so the fitted track sits in the map above it.
// A collapsed sheet is one row. The top inset clears the home and help buttons.
export function mobileStormPadding({ isShort, collapsed, height }) {
    const fallback = isShort ? 390 : 844;
    const share = isShort ? 0.36 : 0.40;
    const bottom = collapsed ? 88 : Math.round((height > 0 ? height : fallback) * share);
    return { top: 56, right: 16, bottom, left: 16 };
}

export const PLOT_TYPES = {
    STORM: "Storm",
    SCATTER_PLOT: "Scatter Plot",
    HEATMAP: "Heatmap",
    GRID: "Grid",
    MAX_WIND_GRID: "Max Wind Grid"
};

// IBTrACS basin codes (global). storm.basin is set to the storm's first basin.
export const BASINS = {
    ALL: "All",
    NA: "North Atlantic",
    EP: "East Pacific",
    WP: "West Pacific",
    NI: "North Indian",
    SI: "South Indian",
    SP: "South Pacific",
    SA: "South Atlantic"
};

// The storm dataset is IBTrACS, converted to JSON by
// src/Hurricane/data/convertIbtracsToJson.py and served gzipped from public/.
// Fetched and gunzipped at runtime so the ~185MB dataset never enters the JS bundle.
const STORMS_URL = process.env.PUBLIC_URL + "/hurricane/storms.json.gz";
const META_URL = process.env.PUBLIC_URL + "/hurricane/meta.json";
const GRIDSAT_URL = process.env.PUBLIC_URL + "/hurricane/gridsat/frames.json";

const loadStorms = async () => {
    const response = await fetch(STORMS_URL);
    if (!response.ok) {
        throw new Error(`Failed to load storm data (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Decompress ourselves unless the server already did (Content-Encoding).
    // Gzip magic bytes are 0x1f 0x8b.
    const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    let text;
    if (isGzip && typeof DecompressionStream !== "undefined") {
        const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
        text = await new Response(stream).text();
    } else {
        text = new TextDecoder().decode(bytes);
    }
    return JSON.parse(text);
};

// Season bounds and the data-through date. The page does not hard-code a year.
const loadMeta = async () => {
    const response = await fetch(META_URL);
    if (!response.ok) {
        throw new Error(`Failed to load storm metadata (${response.status})`);
    }
    return response.json();
};

// Sandy and Matthew only. A missing file leaves the map without an overlay.
const loadGridsatFrames = async () => {
    try {
        const response = await fetch(GRIDSAT_URL);
        if (!response.ok) return [];
        const body = await response.json();
        return Array.isArray(body.frames) ? body.frames : [];
    } catch (e) {
        return [];
    }
};

const SYSTEM_STATUSES = {
    "None": "",
    "Tropical Depression": "TD",
    "Tropical Storm": "TS",
    "Hurricane": "HU",
    "Extra-Tropical": "EX",
    "Sub-Tropical Depression": "SD",
    "Sub-Tropical Storm": "SS",
    "Low": "LO",
    "Disturbance": "DB"
};

// Re-exported so storm-info can colour a point. Null wind is gray, not a category.
export const getColorFromWindSpeed = colorForWind;

// Deck.gl fill colours are four components. A 3-long white selected point is
// easy to mis-pack, and dimming by writing color[3] mutates the shared RGB array.
export function scatterFillColor(wind, role) {
    const [red, green, blue] = colorForWind(wind);
    if (role === "selected") return [255, 255, 255, 255];
    if (role === "dimmed") return [red, green, blue, 128];
    return [red, green, blue, 255];
}

export function scatterStrokeColor(wind, selected) {
    if (!selected) return [0, 0, 0, 0];
    const [red, green, blue] = colorForWind(wind);
    return [red, green, blue, 255];
}

const getLineDataFromStormTrackPoints = (storms) => {
    const line_list = []
    storms.forEach(storm => {
        const trackpoints = storm["track_points"]
        for (let i = 0; i < trackpoints.length - 1; i++) {
            const line = {
                color: [...getColorFromWindSpeed(trackpoints[i].wind), 200],
                id: trackpoints[i]["id"],
                from: [trackpoints[i]["longitude"], trackpoints[i]["latitude"]],
                to: [trackpoints[i + 1]["longitude"], trackpoints[i + 1]["latitude"]]
            }
            line_list.push(line);
        }
    });
    return line_list
};

const getStormLineLayer = (storms, settings) => new LineLayer({
    id: 'line-layer',
    data: getLineDataFromStormTrackPoints(Object.values(storms)),
    pickable: false,
    getSourcePosition: d => d.from,
    getTargetPosition: d => d.to,
    getColor: d => d.color,
    wrapLongitude: true,
    ...settings
});

const getMaxWindAreaLayer = (track_points) => new PolygonLayer({
    id: 'max-wind-polygon-layer',
    data: track_points,
    lineWidthMinPixels: 1,
    getPolygon: point => point.max_wind_poly,
    getFillColor: d => {
        const color = [...getColorFromWindSpeed(d.wind)];
        color[3] = 60;
        return color;
        },
    getLineColor: [0, 0, 0, 0]
});

const wind_area_keys = ["34_ne_poly", "34_se_poly", "34_sw_poly", "34_nw_poly", "50_ne_poly", "50_se_poly", "50_sw_poly",
    "50_nw_poly", "64_ne_poly", "64_se_poly", "64_sw_poly", "64_nw_poly"];

const getWindAreaLayers = (track_points, selectedPoint) => {
    return wind_area_keys.map(key => getWindAreaLayer(track_points.filter(point => point[key]), key, selectedPoint));
}
const getWindAreaLayer = (track_points, key, selectedPoint) => new PolygonLayer({
    id: `wind-area-polygon-layer-${key}`,
    data: track_points,
    lineWidthMinPixels: 1,
    getPolygon: point => point[key],
    getFillColor: d => {
        let color = [0,0,0,0];
        // Same bins as the category legend. 64 kt is Cat 1, 50 kt is a
        // tropical storm, and the 34 kt ring uses the depression colour.
        if (key.startsWith("64")) {
            color = [...colorForWind(64), 40];
        } else if (key.startsWith("50")) {
            color = [...colorForWind(50), 30];
        } else {
            color = [...colorForWind(0), 20];
        }
        if (selectedPoint && d.date_time === selectedPoint.date_time) {
            color[3] = color[3]*4;
        }
        return color;
    },
    getLineColor: [0, 0, 0, 0]
});

const getScatterplotLayer = (track_points, setHoverInfo, onChange, selectedPoint, settings) => new ScatterplotLayer({
    id: 'scatterplot-layer',
    getPosition: d => [d.longitude, d.latitude],
    getFillColor: d => scatterFillColor(
        d.wind,
        !selectedPoint ? "plain" : d.date_time === selectedPoint.date_time ? "selected" : "dimmed"
    ),
    getLineColor: d => scatterStrokeColor(d.wind, !!(selectedPoint && d.date_time === selectedPoint.date_time)),
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    data: track_points,
    pickable: true,
    onHover: info => setHoverInfo(info),
    onClick: info => onChange({ target: { name: "selectStorm", value: info.object }}),
    ...settings
});

const getHeatmapLayer = (track_points, settings) => new HeatmapLayer({
    id: 'heatmapLayer',
    data: track_points,
    getPosition: d => [d.longitude, d.latitude],
    getWeight: d => 1, // MAYBE ACE/WIND/PRESSURE in the future?
    aggregation: 'SUM',
    ...settings
});

const getGridLayer = (track_points, settings) => new GridLayer({
    id: 'new-grid-layer',
    data: track_points,
    pickable: true,
    extruded: true,
    colorRange: [[255,255,204,128],[255,237,160,128],[254,217,118,128],[254,178,76,128],[253,141,60,128],[252,78,42,128] ,[227,26,28,128],[189,0,38,128],[128,0,38,128]],
    getPosition: d => [d.longitude, d.latitude],
    ...settings
});


const getGridLayerMaxWind = (track_points, settings) => new GridLayer({
    id: 'max-wind-grid-layer',
    data: track_points,
    pickable: true,
    extruded: true,
    colorRange: [[255,255,204,128],[255,237,160,128],[254,217,118,128],[254,178,76,128],[253,141,60,128],[252,78,42,128] ,[227,26,28,128],[189,0,38,128],[128,0,38,128]],
    getPosition: d => [d.longitude, d.latitude],
    getElevationWeight: p => p.wind,
    getColorWeight: p => p.wind,
    colorAggregation: 'MAX',
    elevationAggregation: 'MAX',
    ...settings
});

// One frame per storm. The image does not change when the selected point does.
// bounds are the resampled geographic edges from frames.json, unmodified.
const getGridsatLayer = (stormInfo, frames) => {
    if (!stormInfo || !frames) return null;
    const frame = frames.find(item => item.sid === stormInfo.id);
    if (!frame) return null;
    return new BitmapLayer({
        id: "gridsat-frame",
        image: process.env.PUBLIC_URL + "/hurricane/gridsat/" + frame.image,
        bounds: frame.bounds,
        pickable: false,
    });
};

const getStormLayers = (storms, setHoverInfo, onChange, showMaxWindPoly, showWindPoly, stormInfo, selectedPoint, scatterplotSettings, lineSettings, gridsatFrames) => {
    const track_points = Object.values(storms).flatMap(storm => storm["track_points"]);
    const selectedPointActual = stormInfo ? stormInfo.track_points[selectedPoint] : null;
    const layers = [];
    const gridsat = getGridsatLayer(stormInfo, gridsatFrames);
    if (gridsat) layers.push(gridsat);
    layers.push(
        getScatterplotLayer(track_points, setHoverInfo, onChange, selectedPointActual, scatterplotSettings),
        getStormLineLayer(storms, lineSettings)
    );
    if (showMaxWindPoly) {
        layers.push(
            getMaxWindAreaLayer(track_points.filter(track_point => track_point.max_wind_poly))
        )
    }
    if (showWindPoly) {
        layers.push(
            getWindAreaLayers(track_points, selectedPointActual)
        )
    }
    return layers;
};

const getNewViewPort = (track_points) => {
    let minLat = 1000;
    let maxLat = -1000;
    let minLon = 1000;
    let maxLon = -1000;
    track_points.forEach(point => {
        if (point.latitude > maxLat) {
            maxLat = point.latitude;
        }
        if (point.latitude < minLat) {
            minLat = point.latitude;
        }
        if (point.longitude > maxLon) {
            maxLon = point.longitude;
        }
        if (point.longitude < minLon) {
            minLon = point.longitude;
        }
    })
    return {minLat, maxLat, minLon, maxLon}
}

class Hurricane extends Component {
    state = {
        height: 0,
        width: 0,
        viewState: {
            longitude: -64,
            latitude: 26,
            zoom: 3,
            pitch: 0,
            bearing: 0
        },
        scatterplotSettings: {
            name: "scatterplotSettings",
            radiusScale: 3,
            lineWidthScale: 2,
            stroked: true,
            filled: true,
            radiusMinPixels: 4,
            radiusMaxPixels: Number.MAX_SAFE_INTEGER,
            lineWidthMinPixels: 2,
            lineWidthMaxPixels: Number.MAX_SAFE_INTEGER
        },
        lineSettings: {
            name: "lineSettings",
            widthScale: 1,
            widthMinPixels: 0,
            widthMaxPixels: Number.MAX_SAFE_INTEGER
        },
        gridSettings: {
            name: "gridSettings",
            cellSize: 100000,
            elevationScale: 300
        },
        heatmapSettings: {
            name: "heatmapSettings",
            radiusPixels: 50,
            intensity: 1,
            threshold: 0.1
        },
        plotType: PLOT_TYPES.STORM,
        basin: "ALL",
        storms: {},
        dataSource: {},
        data: {},
        loading: true,
        loadError: null,
        name: "",
        // Filled from meta.json once it loads. Empty until then so the
        // season range is not a literal year in this file.
        minYear: "",
        maxYear: "",
        seasonMin: "",
        seasonMax: "",
        dataThrough: "",
        minMonth: 1,
        maxMonth: 12,
        minWind: 0,
        maxWind: 190,
        filterByPressure: false,
        minPressure: 870, // Only out 22,558 points of 53,501 points have pressure
        maxPressure: 1024, // Only 1,186 storms out of 1,936 storms have at leasy one pressure reading
        systemStatus: SYSTEM_STATUSES.None,
        landfall: false,
        showSpurs: false,
        showMaxWindPoly: false,
        showWindPoly: false,
        only6Hour: false,
        hoverInfo: {},
        gridsatFrames: [],
        stormInfo: null,
        stormSheetCollapsed: false,
        selectedPoint: 0,
        filterPanelOpen: true,
        settingsOpen: false,
        sourcesOpen: false,
        controlsDrawerOpen: false,
        helpOpen: (() => {
            try {
                return !window.localStorage.getItem(HELP_SEEN_KEY);
            } catch (e) {
                return true;
            }
        })(),
        layers: []
    };

    closeHelp = () => {
        try {
            window.localStorage.setItem(HELP_SEEN_KEY, "1");
        } catch (e) {
            // ignore storage failures (private mode, etc.)
        }
        this.setState({ helpOpen: false });
    };

    exitStormInfo = () => {
        this.onChange({ target: { name: "exitStorm" } });
    };

    toggleStormSheet = () => {
        this.setState((prev) => {
            const stormSheetCollapsed = !prev.stormSheetCollapsed;
            if (!prev.stormInfo) {
                return { stormSheetCollapsed };
            }
            return {
                stormSheetCollapsed,
                viewState: this.viewStateForStorm(prev.stormInfo, stormSheetCollapsed),
            };
        });
    };

    // Frame the selected track in the map that remains above the phone sheet.
    viewStateForStorm(storm, collapsed, width, height) {
        const { minLat, maxLat, minLon, maxLon } = getNewViewPort(storm.track_points);
        const isMobile = this.props.viewport && this.props.viewport.isMobile;
        const w = width || this.state.width || (typeof window !== "undefined" ? window.innerWidth : 800);
        const h = height || this.state.height || (typeof window !== "undefined" ? window.innerHeight : 600);
        if (w < 10 || h < 10) {
            return this.state.viewState;
        }
        const viewport = new WebMercatorViewport({ ...this.state.viewState, width: w, height: h });
        let padding = isMobile
            ? mobileStormPadding({
                isShort: !!(this.props.viewport && this.props.viewport.isShort),
                collapsed,
                height: h,
            })
            : 80;
        if (padding && typeof padding === "object" && (padding.top + padding.bottom >= h - 40)) {
            padding = 16;
        }
        const fitted = viewport.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding });
        return {
            longitude: fitted.longitude,
            latitude: fitted.latitude,
            zoom: fitted.zoom,
            pitch: fitted.pitch || 0,
            bearing: fitted.bearing || 0,
        };
    }

    // The control and the layer have to see the same point. setState does not
    // update this.state before the next line, so a step used to filter and
    // paint with the previous point.
    patchFromEvent(state, evt) {
        const name = evt.target.name;
        if (name === "name") return { name: evt.target.value };
        if (name === "minYear") return { minYear: evt.target.value };
        if (name === "maxYear") return { maxYear: evt.target.value };
        if (name === "minMonth") return { minMonth: evt.target.value };
        if (name === "maxMonth") return { maxMonth: evt.target.value };
        if (name === "minWind") return { minWind: evt.target.value };
        if (name === "maxWind") return { maxWind: evt.target.value };
        if (name === "filterByPressure") return { filterByPressure: evt.target.checked };
        if (name === "minPressure") return { minPressure: evt.target.value };
        if (name === "maxPressure") return { maxPressure: evt.target.value };
        if (name === "systemStatus") return { systemStatus: evt.target.value };
        if (name === "landfall") return { landfall: evt.target.checked };
        if (name === "showSpurs") return { showSpurs: evt.target.checked };
        if (name === "showMaxWindPoly") return { showMaxWindPoly: evt.target.checked };
        if (name === "showWindPoly") return { showWindPoly: evt.target.checked };
        if (name === "only6Hour") return { only6Hour: evt.target.checked };
        if (name === "plotType") return { plotType: evt.target.value };
        if (name === "basin") return { basin: evt.target.value };
        if (name === "selectStorm") {
            const selectedStorm = state.storms[evt.target.value.id];
            return {
                stormInfo: selectedStorm,
                viewState: this.viewStateForStorm(selectedStorm, false),
                stormSheetCollapsed: false,
            };
        }
        if (name === "selectedPoint") return { selectedPoint: parseInt(evt.target.value, 10) };
        if (name === "backwardSelectedPoint" && state.selectedPoint > 0) {
            return { selectedPoint: state.selectedPoint - 1 };
        }
        if (name === "forwardSelectedPoint" && state.stormInfo && state.selectedPoint < state.stormInfo.track_points.length - 1) {
            return { selectedPoint: state.selectedPoint + 1 };
        }
        if (name === "exitStorm") {
            return { stormInfo: null, selectedPoint: 0, stormSheetCollapsed: false };
        }
        return {};
    }

    layersFor(state) {
        let only6Hour = state.only6Hour;
        let dataSource;
        if (state.plotType === PLOT_TYPES.STORM) {
            dataSource = state.storms;
        } else {
            // Spur tracks repeat a main track. Heatmap, Grid, Max Wind Grid
            // and Scatter never count them. The storm-view toggle does not apply here.
            dataSource = Object.values(state.storms)
                .filter(storm => !isSpurTrack(storm))
                .flatMap(storm => storm["track_points"]);
            // Aggregation layers drop off-synoptic points so the counts stay unbiased.
            if (state.plotType === PLOT_TYPES.HEATMAP || state.plotType === PLOT_TYPES.GRID) {
                only6Hour = true;
            }
            if (state.landfall) {
                only6Hour = false;
            }
        }
        const view = only6Hour === state.only6Hour ? state : { ...state, only6Hour };
        let data;
        if (Array.isArray(dataSource)) {
            data = dataSource
                .filter(point =>
                    (view.basin === "ALL" ? true : view.storms[point.id].basin === view.basin)
                    && point.year >= view.minYear
                    && point.year <= view.maxYear
                    && point.month >= view.minMonth
                    && point.month <= view.maxMonth
                    && hasWindInRange(point.wind, view.minWind, view.maxWind)
                    && (view.filterByPressure ? point.pressure && point.pressure >= view.minPressure : true)
                    && (view.filterByPressure ? point.pressure && point.pressure <= view.maxPressure : true)
                    && (SYSTEM_STATUSES[view.systemStatus] ? point.status === SYSTEM_STATUSES[view.systemStatus] : true)
                    && (view.landfall ? point.record_type === "L" : true)
                    && (view.only6Hour ? point.minutes === 0 && point.hours % 6 === 0 : true));
        } else {
            data = Object.fromEntries(Object.entries(dataSource)
                .filter(([k, storm]) =>
                    (view.stormInfo ? view.stormInfo["id"] === storm["id"] : true)
                    && (view.basin === "ALL" ? true : storm.basin === view.basin)
                    && (view.name ? storm.name.startsWith(view.name.toUpperCase()) : true)
                    && storm.season >= view.minYear
                    && storm.season <= view.maxYear
                    && storm.track_points[0].month >= view.minMonth
                    && storm.track_points[storm.track_points.length - 1].month <= view.maxMonth
                    && (view.showSpurs || !isSpurTrack(storm))
                    && hasWindInRange(storm.max_wind, view.minWind, view.maxWind)
                    && (view.filterByPressure ? storm.min_pressure && storm.min_pressure >= view.minPressure : true)
                    && (view.filterByPressure ? storm.min_pressure && storm.min_pressure <= view.maxPressure : true)
                    && (SYSTEM_STATUSES[view.systemStatus] ? storm.status_list.includes(SYSTEM_STATUSES[view.systemStatus]) : true)
                    && (view.landfall ? storm.record_type_list.includes("L") : true)));
        }
        let layers;
        if (view.plotType === PLOT_TYPES.STORM) {
            layers = getStormLayers(data, hoverInfo => this.setState({hoverInfo}), this.onChange,
                view.showMaxWindPoly, view.showWindPoly, view.stormInfo, view.selectedPoint, view.scatterplotSettings, view.lineSettings, view.gridsatFrames);
        } else if (view.plotType === PLOT_TYPES.HEATMAP) {
            layers = getHeatmapLayer(data, view.heatmapSettings);
        } else if (view.plotType === PLOT_TYPES.GRID) {
            layers = getGridLayer(data, view.gridSettings);
        } else if (view.plotType === PLOT_TYPES.MAX_WIND_GRID) {
            layers = getGridLayerMaxWind(data, view.gridSettings);
        } else {
            layers = getScatterplotLayer(data, hoverInfo => this.setState({hoverInfo}), stormInfo => {}, null, view.scatterplotSettings);
        }
        return { only6Hour, dataSource, data, layers };
    }

    onChange = (evt) => {
        this.setState(prev => {
            const partial = this.patchFromEvent(prev, evt);
            return { ...partial, ...this.layersFor({ ...prev, ...partial }) };
        });
    };

    onSettingsChange = (evt, settings) => {
        this.setState(prev => {
            const nextSettings = {
                ...prev[settings.name],
                [evt.target.name]: parseFloat(evt.target.value)
            };
            return {
                [settings.name]: nextSettings,
                ...this.layersFor({ ...prev, [settings.name]: nextSettings })
            };
        });
    }

    updateDimensions = () => {
        if (this.divElement) {
            const height = this.divElement.clientHeight;
            const width = this.divElement.clientWidth;
            // Keep viewState a plain object. Storing a WebMercatorViewport
            // instance here makes deck.gl throw on the resize re-render
            // ("Cannot assign to read only property 'padding'"); DeckGL sizes
            // itself from its container, so width/height aren't needed here.
            // With a storm open on a phone, refit into the area above the sheet
            // instead of jumping back to the Atlantic overview.
            const keepStorm = this.state.stormInfo && this.props.viewport && this.props.viewport.isMobile;
            this.setState({
                height, width,
                viewState: keepStorm
                    ? this.viewStateForStorm(this.state.stormInfo, this.state.stormSheetCollapsed, width, height)
                    : {
                        longitude: -64,
                        latitude: 26,
                        zoom: 3,
                        pitch: 0,
                        bearing: 0
                    },
            });
        }
    };

    handleResize = () => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(this.updateDimensions, 100);
    };

    // Step through the selected storm's track points with the arrow keys while the
    // detail panel is open. Skip when a form control is focused so its own arrow-key
    // behavior (sliders, number inputs) still works.
    handleKeyDown = (evt) => {
        if (!this.state.stormInfo) return;
        const tag = evt.target && evt.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') {
            evt.preventDefault();
            this.onChange({ target: { name: 'forwardSelectedPoint' } });
        } else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') {
            evt.preventDefault();
            this.onChange({ target: { name: 'backwardSelectedPoint' } });
        }
    };

    async componentDidMount() {
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);
        this.updateDimensions();
        try {
            const [storms, meta, gridsatFrames] = await Promise.all([
                loadStorms(), loadMeta(), loadGridsatFrames()
            ]);
            // Default and maximum season come from the storm file. Run the
            // initial filter only after that state is committed.
            this.setState({
                storms,
                dataSource: storms,
                data: storms,
                minYear: meta.minSeason,
                maxYear: meta.maxSeason,
                seasonMin: meta.minSeason,
                seasonMax: meta.maxSeason,
                dataThrough: meta.dataThrough,
                gridsatFrames,
                loading: false,
            }, () => {
                this.onChange({target: {name: PLOT_TYPES.STORM}});
            });
        } catch (error) {
            console.error(error);
            this.setState({ loading: false, loadError: error.message });
        }
    }

    componentWillUnmount() {
        clearTimeout(this.resizeTimer);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    getToolTip = (object) => {
        if (!object) { return; }
        if (this.state.plotType === "Max Wind Grid") {
            return `Max Wind: ${formatKnots(object.colorValue)}`
        }
        if (this.state.plotType === "Grid") {
            return `# of track points: ${object.colorValue}`
        }
    }

    render() {
        const isMobile = this.props.viewport && this.props.viewport.isMobile;
        const isShort = this.props.viewport && this.props.viewport.isShort;
        return (
            <div className="mobile-dvh hurricane-page" style={{width: "100vw", height: "100vh"}} ref={ (divElement) => { this.divElement = divElement } }>
                <style>{`
                    .hurricane-page .mobile-sheet button,
                    .hurricane-page .mobile-drawer-body button,
                    .hurricane-page .mobile-drawer-body input,
                    .hurricane-page .mobile-drawer-body select,
                    .hurricane-page .mobile-drawer-close {
                        min-height: 44px;
                        min-width: 44px;
                        font-size: 16px;
                    }
                    .hurricane-page .mobile-drawer-body input[type="checkbox"],
                    .hurricane-page .mobile-drawer-body input[type="radio"] {
                        width: 44px;
                        height: 44px;
                    }
                    .hurricane-page .mobile-drawer-body label,
                    .hurricane-page .mobile-sheet label {
                        font-size: 16px;
                        line-height: 1.35;
                    }
                `}</style>
                <HomeButton />
                <DeckGL
                    viewState={this.state.viewState}
                    controller={true}
                    onViewStateChange={({ viewState }) => this.setState({ viewState })}
                    layers={this.state.layers}
                    getTooltip={({object}) => this.getToolTip(object)}
                >
                    <Map
                        reuseMaps
                        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                        mapStyle={MAP_STYLE}
                        attributionControl={false}
                        onLoad={isolateMapControls}
                    >
                        {/* On phones the Controls button covers the
                            bottom-right corner, so the attribution moves
                            beside the logo. */}
                        <AttributionControl
                            key={isMobile ? 'mobile' : 'desktop'}
                            position={isMobile ? 'bottom-left' : 'bottom-right'}
                            compact={isMobile ? false : undefined}
                        />
                    </Map>

                    {this.state.hoverInfo && this.state.hoverInfo.object && (
                        <div
                            style={{position: 'absolute',
                                left: this.state.hoverInfo.x,
                                top: this.state.hoverInfo.y,
                                backgroundColor: 'var(--color-surface)',
                                boxShadow: 'var(--shadow-panel)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '6px 12px',
                                margin: '20px',
                                fontSize: '13px',
                                lineHeight: 2,
                                color: 'var(--color-text-muted)',
                                outline: 'none',
                                zIndex: 9999,
                                pointerEvents: 'none',}}
                        >
                            <div className="column">
                                <p>Name: {this.state.storms[this.state.hoverInfo.object["id"]]["name"]}</p>
                                <p>Date: {this.state.hoverInfo.object["date_time"].split(" ")[0]}</p>
                                <p>Longitude: {this.state.hoverInfo.object["longitude"]}</p>
                                <p>Wind: {formatKnots(this.state.hoverInfo.object["wind"])}</p>
                                {this.state.hoverInfo.object["max_wind_radius"] && <p>Max Wind Radius: {this.state.hoverInfo.object["max_wind_radius"]}</p>}
                            </div>
                            <div className="column" style={{paddingLeft: 10}}>
                                <p>Season: {this.state.storms[this.state.hoverInfo.object["id"]]["season"]}</p>
                                <p>Time: {this.state.hoverInfo.object["date_time"].split(" ")[1]}</p>
                                <p>Latitude: {this.state.hoverInfo.object["latitude"]}</p>
                                <p>Status: {statusName(this.state.hoverInfo.object["status"])}</p>
                                {this.state.hoverInfo.object["pressure"] && <p>Pressure: {formatMillibars(this.state.hoverInfo.object["pressure"])}</p>}
                            </div>
                        </div>
                    )}
                </DeckGL>
                {(this.state.loading || this.state.loadError) && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: 'var(--color-surface)',
                        boxShadow: 'var(--shadow-panel)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 20px',
                        fontSize: '14px',
                        color: this.state.loadError ? 'var(--color-danger)' : 'var(--color-text-muted)',
                        zIndex: 9999,
                    }}>
                        {this.state.loadError
                            ? `Could not load storm data: ${this.state.loadError}`
                            : 'Loading global storm data…'}
                    </div>
                )}
                {this.state.stormInfo && (
                    isMobile ? (
                        <div
                            className="mobile-sheet"
                            style={{
                                maxHeight: this.state.stormSheetCollapsed
                                    ? "none"
                                    : mobileSheetMaxHeight(!!isShort),
                                paddingRight: 72,
                            }}
                        >
                            <StormInfo
                                embedded
                                collapsed={this.state.stormSheetCollapsed}
                                onToggleCollapsed={this.toggleStormSheet}
                                stormInfo={this.state.stormInfo}
                                selectedPoint={this.state.selectedPoint}
                                onChange={this.onChange}
                                exitStormInfo={this.exitStormInfo}
                            />
                        </div>
                    ) : (
                        <StormInfo
                            stormInfo={this.state.stormInfo}
                            selectedPoint={this.state.selectedPoint}
                            onChange={this.onChange}
                            exitStormInfo={this.exitStormInfo}
                        />
                    )
                )}
                {!isMobile && (
                    <FilterPanel
                        filterPanelOpen={this.state.filterPanelOpen}
                        plotType={this.state.plotType}
                        plotTypeOptions={PLOT_TYPES}
                        basin={this.state.basin}
                        basinOptions={BASINS}
                        name={this.state.name}
                        systemStatus={this.state.systemStatus}
                        systemStatusOptions={SYSTEM_STATUSES}
                        minYear={this.state.minYear}
                        maxYear={this.state.maxYear}
                        seasonMin={this.state.seasonMin}
                        seasonMax={this.state.seasonMax}
                        minMonth={this.state.minMonth}
                        maxMonth={this.state.maxMonth}
                        minWind={this.state.minWind}
                        maxWind={this.state.maxWind}
                        filterByPressure={this.state.filterByPressure}
                        minPressure={this.state.minPressure}
                        maxPressure={this.state.maxPressure}
                        landfall={this.state.landfall}
                        showSpurs={this.state.showSpurs}
                        showMaxWindPoly={this.state.showMaxWindPoly}
                        showWindPoly={this.state.showWindPoly}
                        only6Hour={this.state.only6Hour}
                        onChange={evt => this.onChange(evt)}
                        toggleFilterPanel={evt => {this.setState(prevState => ({ filterPanelOpen: !prevState.filterPanelOpen}))}}
                    />
                )}
                {!isMobile && (
                    // Bottom-right control stack: Settings sits beside the
                    // sources button instead of underneath it, and the stack
                    // clears the Mapbox attribution along the bottom edge.
                    <div
                        style={{
                            position: "absolute",
                            right: 20,
                            bottom: 24,
                            zIndex: 9999,
                            display: "flex",
                            alignItems: "flex-end",
                            gap: 8,
                        }}
                    >
                        <SettingsPanel
                            settingsOpen={this.state.settingsOpen}
                            onSettingsChange={this.onSettingsChange}
                            toggleSettingsPanel={evt => {this.setState(prevState => ({ settingsOpen: !prevState.settingsOpen}))}}
                            scatterplotSettings={this.state.scatterplotSettings}
                            lineSettings={this.state.lineSettings}
                            gridSettings={this.state.gridSettings}
                            heatmapSettings={this.state.heatmapSettings}
                            plotType={this.state.plotType}
                        />
                        <SourcesPanel
                            open={this.state.sourcesOpen}
                            dataThrough={this.state.dataThrough}
                            toggle={() => this.setState(prevState => ({ sourcesOpen: !prevState.sourcesOpen }))}
                        />
                    </div>
                )}
                {isMobile && (
                    <ControlsFab onClick={() => this.setState({ controlsDrawerOpen: true })} />
                )}
                {isMobile && (
                    <MobileDrawer
                        open={this.state.controlsDrawerOpen}
                        onClose={() => this.setState({ controlsDrawerOpen: false })}
                        title="Controls"
                    >
                        <div className="mobile-drawer-section">Filters</div>
                        <FilterPanel
                            embedded
                            filterPanelOpen
                            plotType={this.state.plotType}
                            plotTypeOptions={PLOT_TYPES}
                            basin={this.state.basin}
                            basinOptions={BASINS}
                            name={this.state.name}
                            systemStatus={this.state.systemStatus}
                            systemStatusOptions={SYSTEM_STATUSES}
                            minYear={this.state.minYear}
                            maxYear={this.state.maxYear}
                            seasonMin={this.state.seasonMin}
                            seasonMax={this.state.seasonMax}
                            minMonth={this.state.minMonth}
                            maxMonth={this.state.maxMonth}
                            minWind={this.state.minWind}
                            maxWind={this.state.maxWind}
                            filterByPressure={this.state.filterByPressure}
                            minPressure={this.state.minPressure}
                            maxPressure={this.state.maxPressure}
                            landfall={this.state.landfall}
                            showSpurs={this.state.showSpurs}
                            showMaxWindPoly={this.state.showMaxWindPoly}
                            showWindPoly={this.state.showWindPoly}
                            only6Hour={this.state.only6Hour}
                            onChange={evt => this.onChange(evt)}
                        />
                        <div className="mobile-drawer-section">Rendering</div>
                        <SettingsPanel
                            embedded
                            onSettingsChange={this.onSettingsChange}
                            scatterplotSettings={this.state.scatterplotSettings}
                            lineSettings={this.state.lineSettings}
                            gridSettings={this.state.gridSettings}
                            heatmapSettings={this.state.heatmapSettings}
                            plotType={this.state.plotType}
                        />
                        <div className="mobile-drawer-section">Data &amp; imagery sources</div>
                        <SourcesPanel embedded dataThrough={this.state.dataThrough} />
                    </MobileDrawer>
                )}
                <CategoryLegend isMobile={!!isMobile} />
                <HelpPanel
                    open={this.state.helpOpen}
                    onOpen={() => this.setState({ helpOpen: true })}
                    onClose={this.closeHelp}
                    fabPosition={isMobile ? { top: 12, right: 12 } : { top: 16, left: 112 }}
                />
            </div>
        );
    }
}

export default withViewport(Hurricane);