import React, { Component } from 'react';
import DeckGL from '@deck.gl/react';
import { GridLayer, HeatmapLayer } from '@deck.gl/aggregation-layers';
import { LineLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { WebMercatorViewport, MapViewState } from '@deck.gl/core';
import Map from 'react-map-gl/mapbox';
import FilterPanel from "./FilterPanel";
import CREDENTIALS from "../credentials.json";
import SettingsPanel from "./SettingsPanel";
import STORMSJson from './data/storms_with_ir.json';
const STORMS = STORMSJson as Record<string, Storm>;

// Types
type Point = {
    id: string;
    longitude: number;
    latitude: number;
    wind: number;
    pressure?: number;
    date_time: string;
    year: number;
    month: number;
    minutes: number;
    hours: number;
    status: string;
    record_type?: string;
    max_wind_radius?: number;
    max_wind_poly?: any;
    [key: string]: any;
};

type Storm = {
    id: string;
    name: string;
    season: number;
    basin: string;
    max_wind: number;
    min_pressure?: number;
    status_list: string[];
    record_type_list: string[];
    track_points: Point[];
};

type LineData = {
    color: [number, number, number, number];
    id: string;
    from: [number, number];
    to: [number, number];
};


type ScatterplotSettings = {
    name: string;
    radiusScale: number;
    lineWidthScale: number;
    stroked: boolean;
    filled: boolean;
    radiusMinPixels: number;
    radiusMaxPixels: number;
    lineWidthMinPixels: number;
    lineWidthMaxPixels: number;
};

type LineSettings = {
    name: string;
    widthScale: number;
    widthMinPixels: number;
    widthMaxPixels: number;
};

type GridSettings = {
    name: string;
    cellSize: number;
    elevationScale: number;
};

type HeatmapSettings = {
    name: string;
    radiusPixels: number;
    intensity: number;
    threshold: number;
};

type HurricaneState = {
    height: number;
    width: number;
    viewState: MapViewState;
    scatterplotSettings: ScatterplotSettings;
    lineSettings: LineSettings;
    gridSettings: GridSettings;
    heatmapSettings: HeatmapSettings;
    plotType: string;
    basin: string;
    dataSource: any;
    data: any;
    name: string;
    minYear: number;
    maxYear: number;
    minMonth: number;
    maxMonth: number;
    minWind: number;
    maxWind: number;
    filterByPressure: boolean;
    minPressure: number;
    maxPressure: number;
    systemStatus: string;
    landfall: boolean;
    showMaxWindPoly: boolean;
    showWindPoly: boolean;
    only6Hour: boolean;
    hoverInfo: any;
    stormInfo: Storm | null;
    selectedPoint: number;
    filterPanelOpen: boolean;
    settingsOpen: boolean;
    layers: any[];
};

type StormInfoProps = {
    stormInfo: Storm;
    selectedPoint: number;
    onChange: (evt: any) => void;
    exitStormInfo: (evt: any) => void;
};

export const PLOT_TYPES = {
    STORM: "Storm",
    SCATTER_PLOT: "Scatter Plot",
    HEATMAP: "Heatmap",
    GRID: "Grid",
    MAX_WIND_GRID: "Max Wind Grid"
};

const BASINS = {
    ALL: "All",
    AL: "North Atlantic",
    EP: "East Pacific",
    CP: "Central Pacific"
};

const SYSTEM_STATUSES: Record<string, string> = {
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

export const getColorFromWindSpeed = (windspeed: number): [number, number, number] => {
    if (windspeed >= 137) {
        return [196, 100, 217];
    }
    if (windspeed >= 113) {
        return [255, 96, 96];
    }
    if (windspeed >= 96) {
        return [255, 143, 32];
    }
    if (windspeed >= 83) {
        return [255, 216, 33];
    }
    if (windspeed >= 64) {
        return [255, 247, 149];
    }
    if (windspeed >= 34) {
        return [0, 250, 244];
    }
    return [94, 186, 255];
};

const getLineDataFromStormTrackPoints = (storms: Storm[]): LineData[] => {
    const line_list: LineData[] = [];
    storms.forEach(storm => {
        const trackpoints = storm.track_points;
        for (let i = 0; i < trackpoints.length - 1; i++) {
            const line: LineData = {
                color: [...getColorFromWindSpeed(trackpoints[i].wind), 200] as [number, number, number, number],
                id: trackpoints[i].id,
                from: [trackpoints[i].longitude, trackpoints[i].latitude],
                to: [trackpoints[i + 1].longitude, trackpoints[i + 1].latitude]
            };
            line_list.push(line);
        }
    });
    return line_list;
};

const getStormLineLayer = (storms: Storm[], settings: LineSettings): LineLayer => new LineLayer({
    id: 'line-layer',
    data: getLineDataFromStormTrackPoints(Object.values(storms)),
    pickable: false,
    getSourcePosition: (d: LineData) => d.from,
    getTargetPosition: (d: LineData) => d.to,
    getColor: (d: LineData) => d.color,
    ...settings
});

const getMaxWindAreaLayer = (track_points: Point[]): PolygonLayer => new PolygonLayer({
    id: 'polygon-layer',
    data: track_points,
    lineWidthMinPixels: 1,
    getPolygon: (point: Point) => point.max_wind_poly,
    getFillColor: (d: Point) => {
        return [...getColorFromWindSpeed(d.wind), 60] as [number, number, number, number];
    },
    getLineColor: [0, 0, 0, 0]
});

const wind_area_keys = ["34_ne_poly", "34_se_poly", "34_sw_poly", "34_nw_poly", "50_ne_poly", "50_se_poly", "50_sw_poly",
    "50_nw_poly", "64_ne_poly", "64_se_poly", "64_sw_poly", "64_nw_poly"];

const getWindAreaLayers = (track_points: Point[], selectedPoint: Point | null): PolygonLayer[] => {
    return wind_area_keys.map(key => getWindAreaLayer(track_points.filter(point => point[key]), key, selectedPoint));
};

const getWindAreaLayer = (track_points: Point[], key: string, selectedPoint: Point | null): PolygonLayer => new PolygonLayer({
    id: 'polygon-layer',
    data: track_points,
    lineWidthMinPixels: 1,
    getPolygon: (point: Point) => point[key],
    getFillColor: (d: Point) => {
        let color: [number, number, number, number];
        if (key.startsWith("64")) {
            color = [255, 247, 149, 40];
        } else if (key.startsWith("50")) {
            color = [0, 250, 244, 30];
        } else {
            color = [94, 186, 255, 20];
        }
        if (selectedPoint && d.date_time === selectedPoint.date_time) {
            color[3] = color[3] * 4;
        }
        return color;
    },
    getLineColor: [0, 0, 0, 0]
});

const getScatterplotLayer = (
    track_points: Point[],
    setHoverInfo: (info: any) => void,
    onChange: (evt: any) => void,
    selectedPoint: Point | null,
    settings: ScatterplotSettings
): ScatterplotLayer => new ScatterplotLayer({
    id: 'scatterplot-layer',
    getPosition: (d: Point) => [d.longitude, d.latitude],
    getFillColor: (d: Point) => {
        let color = [...getColorFromWindSpeed(d.wind), selectedPoint && d.date_time === selectedPoint.date_time ? 255 : 128] as [number, number, number, number];
        if (selectedPoint && d.date_time === selectedPoint.date_time) {
            color = [255, 255, 255, 255];
        }
        return color;
    },
    getLineColor: (d: Point) => {
        let color: [number, number, number, number] = [0, 0, 0, 0];
        if (selectedPoint && d.date_time === selectedPoint.date_time) {
            color = [...getColorFromWindSpeed(d.wind), 255] as [number, number, number, number];
        }
        return color;
    },
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    data: track_points,
    pickable: true,
    onHover: (info: any) => setHoverInfo(info),
    onClick: (info: any) => onChange({ target: { name: "selectStorm", value: info.object }}),
    ...settings
});

const getHeatmapLayer = (track_points: Point[], settings: HeatmapSettings): HeatmapLayer => new HeatmapLayer({
    id: 'heatmapLayer',
    data: track_points,
    getPosition: (d: Point) => [d.longitude, d.latitude],
    getWeight: (_: Point) => 1,
    aggregation: 'SUM',
    ...settings
});

const getGridLayer = (track_points: Point[], settings: GridSettings): GridLayer => new GridLayer({
    id: 'new-grid-layer',
    data: track_points,
    pickable: true,
    extruded: true,
    colorRange: [[255, 255, 204, 128], [255, 237, 160, 128], [254, 217, 118, 128], [254, 178, 76, 128], [253, 141, 60, 128], [252, 78, 42, 128], [227, 26, 28, 128], [189, 0, 38, 128], [128, 0, 38, 128]],
    getPosition: (d: Point) => [d.longitude, d.latitude],
    ...settings
});

const getGridLayerMaxWind = (track_points: Point[], settings: GridSettings): GridLayer => new GridLayer({
    id: 'new-grid-layer',
    data: track_points,
    pickable: true,
    extruded: true,
    colorRange: [[255, 255, 204, 128], [255, 237, 160, 128], [254, 217, 118, 128], [254, 178, 76, 128], [253, 141, 60, 128], [252, 78, 42, 128], [227, 26, 28, 128], [189, 0, 38, 128], [128, 0, 38, 128]],
    getPosition: (d: Point) => [d.longitude, d.latitude],
    getElevationWeight: (p: Point) => p.wind,
    getColorWeight: (p: Point) => p.wind,
    colorAggregation: 'MAX',
    elevationAggregation: 'MAX',
    ...settings
});

const getStormLayers = (
    storms: Record<string, Storm>,
    setHoverInfo: (info: any) => void,
    onChange: (evt: any) => void,
    showMaxWindPoly: boolean,
    showWindPoly: boolean,
    stormInfo: Storm | null,
    selectedPoint: number,
    scatterplotSettings: ScatterplotSettings,
    lineSettings: LineSettings
) => {
    const track_points = Object.values(storms).flatMap(storm => storm["track_points"]);
    const selectedPointActual = stormInfo ? stormInfo.track_points[selectedPoint] : null;
    const layers: (ScatterplotLayer<any, {}> | LineLayer<any, {}> | PolygonLayer<any, {}>)[] = [
        getScatterplotLayer(track_points, setHoverInfo, onChange, selectedPointActual, scatterplotSettings),
        getStormLineLayer(Object.values(storms), lineSettings)
    ];
    if (showMaxWindPoly) {
        layers.push(
            getMaxWindAreaLayer(track_points.filter(track_point => track_point.max_wind_poly))
        );
    }
    if (showWindPoly) {
        layers.push(...getWindAreaLayers(track_points, selectedPointActual));
    }
    return layers;
};

const getNewViewPort = (track_points: Point[]) => {
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
    });
    return { minLat, maxLat, minLon, maxLon };
};

const isMapViewState = (obj: any): obj is MapViewState => {
    return (
        obj != null &&
        typeof obj.longitude === 'number' &&
        typeof obj.latitude === 'number' &&
        typeof obj.zoom === 'number'
    );
}

class StormInfo extends Component<StormInfoProps> {
    render() {
        const { stormInfo, selectedPoint, onChange, exitStormInfo } = this.props;
        const point = stormInfo.track_points[selectedPoint];

        return (
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                backgroundColor: 'white',
                padding: '10px',
                zIndex: 1000,
                maxWidth: '300px'
            }}>
                <button onClick={exitStormInfo}>X</button>
                <h2>{stormInfo.name} - {stormInfo.season}</h2>
                <p>Point {selectedPoint + 1} of {stormInfo.track_points.length}</p>
                <div>
                    <button
                        name="backwardSelectedPoint"
                        onClick={onChange}
                        disabled={selectedPoint === 0}
                    >
                        Previous
                    </button>
                    <input
                        type="range"
                        min="0"
                        max={stormInfo.track_points.length - 1}
                        value={selectedPoint}
                        name="selectedPoint"
                        onChange={onChange}
                    />
                    <button
                        name="forwardSelectedPoint"
                        onClick={onChange}
                        disabled={selectedPoint === stormInfo.track_points.length - 1}
                    >
                        Next
                    </button>
                </div>
                {point && (
                    <div>
                        <p>Date: {point.date_time}</p>
                        <p>Position: {point.latitude.toFixed(2)}°N, {point.longitude.toFixed(2)}°E</p>
                        <p>Wind: {point.wind} kt</p>
                        <p>Status: {point.status}</p>
                        {point.pressure && <p>Pressure: {point.pressure} hPa</p>}
                    </div>
                )}
            </div>
        );
    }
}

class Hurricane extends Component<{}, HurricaneState> {
    private divElement: HTMLDivElement | null = null;
    private resizeTimeout: number | null = null;

    state: HurricaneState = {
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
        dataSource: STORMS,
        data: STORMS,
        name: "",
        minYear: 1851,
        maxYear: 2021,
        minMonth: 1,
        maxMonth: 12,
        minWind: 0,
        maxWind: 190,
        filterByPressure: false,
        minPressure: 870,
        maxPressure: 1024,
        systemStatus: "None",
        landfall: false,
        showMaxWindPoly: false,
        showWindPoly: false,
        only6Hour: false,
        hoverInfo: {},
        stormInfo: null,
        selectedPoint: 0,
        filterPanelOpen: true,
        settingsOpen: false,
        layers: []
    };

    onChange = (
        evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement> | { target: { name: string; value?: any; checked?: boolean } }
    ) => {
        const target = evt.target;
        const name = target.name;

        // Narrow the target type to safely access checked or value
        let value: any;
        let checked: boolean | undefined;

        if (target instanceof HTMLInputElement) {
            value = target.value;
            checked = target.checked;
        } else if (target instanceof HTMLSelectElement) {
            value = target.value;
            checked = undefined;
        } else {
            // fallback for your custom type with 'checked' optional
            value = target.value;
            checked = target.checked;
        }

        // Now handle the state updates using the narrowed values
        if (name === "name") {
            this.setState({ name: value as string });
        } else if (name === "minYear") {
            this.setState({ minYear: Number(value) });
        } else if (name === "maxYear") {
            this.setState({ maxYear: Number(value) });
        } else if (name === "minMonth") {
            this.setState({ minMonth: Number(value) });
        } else if (name === "maxMonth") {
            this.setState({ maxMonth: Number(value) });
        } else if (name === "minWind") {
            this.setState({ minWind: Number(value) });
        } else if (name === "maxWind") {
            this.setState({ maxWind: Number(value) });
        } else if (name === "filterByPressure") {
            this.setState({ filterByPressure: checked as boolean });
        } else if (name === "minPressure") {
            this.setState({ minPressure: Number(value) });
        } else if (name === "maxPressure") {
            this.setState({ maxPressure: Number(value) });
        } else if (name === "systemStatus") {
            this.setState({ systemStatus: value as string });
        } else if (name === "landfall") {
            this.setState({ landfall: checked as boolean });
        } else if (name === "showMaxWindPoly") {
            this.setState({ showMaxWindPoly: checked as boolean });
        } else if (name === "showWindPoly") {
            this.setState({ showWindPoly: checked as boolean });
        } else if (name === "only6Hour") {
            this.setState({ only6Hour: checked as boolean });
        } else if (name === "plotType") {
            this.setState({ plotType: value as string });
        } else if (name === "basin") {
            this.setState({ basin: value as string });
        } else if (name === "selectStorm") {
            const storm = STORMS[value.id];
            this.setState({ stormInfo: storm, selectedPoint: 0 }, () => {
                if (!storm) return;

                const { minLat, maxLat, minLon, maxLon } = getNewViewPort(storm.track_points);
                const viewport = new WebMercatorViewport({
                    width: this.state.width,
                    height: this.state.height,
                    ...this.state.viewState,
                });
                const newViewport = viewport.fitBounds(
                    [
                        [minLon, minLat],
                        [maxLon, maxLat],
                    ],
                    { padding: 80 }
                );
                this.setState({
                    viewState: {
                        ...this.state.viewState,
                        longitude: newViewport.longitude,
                        latitude: newViewport.latitude,
                        zoom: newViewport.zoom,
                        pitch: newViewport.pitch,
                        bearing: newViewport.bearing,
                        ...(newViewport.padding && { padding: { ...newViewport.padding } }),
                    },
                });
            });
        } else if (name === "selectedPoint") {
            this.setState({ selectedPoint: parseInt(value) });
        } else if (name === "backwardSelectedPoint" && this.state.stormInfo && this.state.selectedPoint > 0) {
            this.setState((prevState) => ({ selectedPoint: prevState.selectedPoint - 1 }));
        } else if (name === "forwardSelectedPoint" && this.state.stormInfo && this.state.selectedPoint < this.state.stormInfo.track_points.length - 1) {
            this.setState((prevState) => ({ selectedPoint: prevState.selectedPoint + 1 }));
        }

        this.updateDataAndLayers();
    };

    updateDataAndLayers = () => {
        const {
            plotType, basin, name, minYear, maxYear, minMonth, maxMonth, minWind, maxWind,
            filterByPressure, minPressure, maxPressure, systemStatus, landfall, only6Hour,
            stormInfo, scatterplotSettings, lineSettings, gridSettings, heatmapSettings,
            showMaxWindPoly, showWindPoly, selectedPoint
        } = this.state;

        let dataSource: any;
        if (plotType === PLOT_TYPES.STORM) {
            dataSource = STORMS;
        } else {
            dataSource = Object.values(STORMS).flatMap((storm: Storm) => storm["track_points"]);
        }

        let data: any;
        if (Array.isArray(dataSource)) {
            data = dataSource
                .filter((point: Point) => {
                    const storm = STORMS[point.id];
                    return (
                        (basin === "ALL" ? true : storm.basin === basin) &&
                        point.year >= minYear &&
                        point.year <= maxYear &&
                        point.month >= minMonth &&
                        point.month <= maxMonth &&
                        point.wind >= minWind &&
                        point.wind <= maxWind &&
                        (!filterByPressure || (point.pressure && point.pressure >= minPressure)) &&
                        (!filterByPressure || (point.pressure && point.pressure <= maxPressure)) &&
                        (SYSTEM_STATUSES[systemStatus] ? point.status === SYSTEM_STATUSES[systemStatus] : true) &&
                        (!landfall || point.record_type === "L") &&
                        (!only6Hour || (point.minutes === 0 && point.hours % 6 === 0))
                    );
                });
        } else {
            data = Object.fromEntries(Object.entries(dataSource)
                .filter(([_, storm]: [string, any]) => {
                    const s = storm as Storm;
                    return (
                        (stormInfo ? stormInfo.id === s.id : true) &&
                        (basin === "ALL" ? true : s.basin === basin) &&
                        (name ? s.name.startsWith(name.toUpperCase()) : true) &&
                        s.season >= minYear &&
                        s.season <= maxYear &&
                        s.track_points[0].month >= minMonth &&
                        s.track_points[s.track_points.length - 1].month <= maxMonth &&
                        s.max_wind >= minWind &&
                        s.max_wind <= maxWind &&
                        (!filterByPressure || (s.min_pressure && s.min_pressure >= minPressure)) &&
                        (!filterByPressure || (s.min_pressure && s.min_pressure <= maxPressure)) &&
                        (SYSTEM_STATUSES[systemStatus] ? s.status_list.includes(SYSTEM_STATUSES[systemStatus]) : true) &&
                        (!landfall || s.record_type_list.includes("L"))
                    );
                }));
        }

        let layers: any[];
        if (plotType === PLOT_TYPES.STORM) {
            layers = getStormLayers(
                data,
                (hoverInfo: any) => this.setState({ hoverInfo }),
                this.onChange,
                showMaxWindPoly,
                showWindPoly,
                stormInfo,
                selectedPoint,
                scatterplotSettings,
                lineSettings
            );
        } else if (plotType === PLOT_TYPES.HEATMAP) {
            layers = [getHeatmapLayer(data, heatmapSettings)];
        } else if (plotType === PLOT_TYPES.GRID) {
            layers = [getGridLayer(data, gridSettings)];
        } else if (plotType === PLOT_TYPES.MAX_WIND_GRID) {
            layers = [getGridLayerMaxWind(data, gridSettings)];
        } else {
            layers = [getScatterplotLayer(
                data,
                (hoverInfo: any) => this.setState({ hoverInfo }),
                () => { },
                null,
                scatterplotSettings
            )];
        }

        this.setState({
            dataSource,
            data,
            layers
        });
    };

    onSettingsChange = (evt: React.ChangeEvent<HTMLInputElement>, settings: any) => {
        const name = evt.target.name;
        const value = parseFloat(evt.target.value);

        this.setState(prevState => ({
            [settings.name]: {
                ...prevState[settings.name as keyof HurricaneState],
                [name]: value
            }
        } as any), this.updateDataAndLayers);
    };

    updateDimensions = () => {
        if (this.divElement) {
            const height = this.divElement.clientHeight;
            const width = this.divElement.clientWidth;
            this.setState({
                height,
                width
            });
        }
    };

    componentDidMount() {
        let minW = 999;
        let maxW = 0;
        let minP = 9999;
        let maxP = 0;
        Object.values(STORMS).flatMap((storm: any) => storm["track_points"]).forEach((point: any) => {
            if (point.wind < minW) {
                minW = point.wind;
            }
            if (point.wind > maxW) {
                maxW = point.wind;
            }
            if (point.pressure) {
                if (point.pressure < minP) {
                    minP = point.pressure;
                }
                if (point.pressure > maxP) {
                    maxP = point.pressure;
                }
            }
        });
        window.addEventListener('resize', () => {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }
            this.resizeTimeout = window.setTimeout(this.updateDimensions, 100);
        });
        this.updateDimensions();
        this.updateDataAndLayers();
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.updateDimensions);
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
    }

    render() {
        const { hoverInfo, stormInfo, selectedPoint, filterPanelOpen, settingsOpen } = this.state;
        const hoveredObject = hoverInfo?.object;

        // @ts-ignore
        return (
            <div style={{ width: "100vw", height: "100vh" }} ref={(divElement) => { this.divElement = divElement }}>
                <DeckGL
                    viewState={this.state.viewState}
                    controller={true}
                    onViewStateChange={({ viewState }) => {
                        if (isMapViewState(viewState)) {
                            this.setState({ viewState });
                        }
                    }}
                    layers={this.state.layers}
                    getTooltip={({ object }) => {
                        if (!object) return null;

                        if (this.state.plotType === PLOT_TYPES.MAX_WIND_GRID) {
                            return { text: `Max Wind: ${object.colorValue}` };
                        }
                        if (this.state.plotType === PLOT_TYPES.GRID) {
                            return { text: `# of track points: ${object.colorValue}` };
                        }

                        return null;
                    }}
                >
                    <Map
                        reuseMaps
                        mapboxAccessToken={CREDENTIALS["MAP_TOKEN"]}
                        mapStyle="mapbox://styles/mapbox/dark-v9"
                    />

                    {hoveredObject && (
                        <div
                            style={{
                                position: 'absolute',
                                left: hoverInfo.x,
                                top: hoverInfo.y,
                                backgroundColor: '#fff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                padding: '6px 12px',
                                margin: '20px',
                                fontSize: '13px',
                                lineHeight: 2,
                                color: '#6b6b76',
                                outline: 'none',
                                zIndex: 9999,
                                pointerEvents: 'none',
                            }}
                        >
                            <div className="column">
                                <p>Name: {STORMS[hoveredObject["id"]]?.["name"]}</p>
                                <p>Date: {hoveredObject["date_time"].split(" ")[0]}</p>
                                <p>Longitude: {hoveredObject["longitude"]}</p>
                                <p>Wind: {hoveredObject["wind"]}</p>
                                {hoveredObject["max_wind_radius"] && <p>Max Wind Radius: {hoveredObject["max_wind_radius"]}</p>}
                            </div>
                            <div className="column" style={{ paddingLeft: 10 }}>
                                <p>Season: {STORMS[hoveredObject["id"]]?.["season"]}</p>
                                <p>Time: {hoveredObject["date_time"].split(" ")[1]}</p>
                                <p>Latitude: {hoveredObject["latitude"]}</p>
                                <p>Status: {hoveredObject["status"]}</p>
                                {hoveredObject["pressure"] && <p>Pressure: {hoveredObject["pressure"]}</p>}
                            </div>
                        </div>
                    )}
                </DeckGL>
                {stormInfo && (
                    <StormInfo
                        stormInfo={stormInfo}
                        selectedPoint={selectedPoint}
                        onChange={this.onChange}
                        exitStormInfo={() => this.setState({ stormInfo: null, selectedPoint: 0 })}
                    />
                )}
                <FilterPanel
                    filterPanelOpen={filterPanelOpen}
                    plotType={this.state.plotType}
                    plotTypeOptions={PLOT_TYPES}
                    basin={this.state.basin}
                    basinOptions={BASINS}
                    name={this.state.name}
                    systemStatus={this.state.systemStatus}
                    systemStatusOptions={SYSTEM_STATUSES}
                    minYear={this.state.minYear}
                    maxYear={this.state.maxYear}
                    minMonth={this.state.minMonth}
                    maxMonth={this.state.maxMonth}
                    minWind={this.state.minWind}
                    maxWind={this.state.maxWind}
                    filterByPressure={this.state.filterByPressure}
                    minPressure={this.state.minPressure}
                    maxPressure={this.state.maxPressure}
                    landfall={this.state.landfall}
                    showMaxWindPoly={this.state.showMaxWindPoly}
                    showWindPoly={this.state.showWindPoly}
                    only6Hour={this.state.only6Hour}
                    onChange={(evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => this.onChange(evt)}
                    toggleFilterPanel={() => this.setState(prevState => ({ filterPanelOpen: !prevState.filterPanelOpen }))}
                />
                <SettingsPanel
                    settingsOpen={settingsOpen}
                    onSettingsChange={this.onSettingsChange}
                    toggleSettingsPanel={() => this.setState(prevState => ({ settingsOpen: !prevState.settingsOpen }))}
                    scatterplotSettings={this.state.scatterplotSettings}
                    lineSettings={this.state.lineSettings}
                    gridSettings={this.state.gridSettings}
                    heatmapSettings={this.state.heatmapSettings}
                    plotType={this.state.plotType}
                />
            </div>
        );
    }
}

export default Hurricane;