import React, { Component } from 'react';
import DeckGL from '@deck.gl/react';
import { GridLayer, HeatmapLayer } from '@deck.gl/aggregation-layers';
import { LineLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import Map from 'react-map-gl';
import STORMS from './data/storms_with_ir.json';
import FilterPanel from "./FilterPanel.tsx";
import CREDENTIALS from "../credentials.json";
import SettingsPanel from "./SettingsPanel.tsx";

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

type ViewState = {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
    padding?: any;
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
    viewState: ViewState;
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

const PLOT_TYPES = {
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

const getColorFromWindSpeed = (windspeed: number): [number, number, number] => {
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
        const color = [...getColorFromWindSpeed(d.wind), 60] as [number, number, number, number];
        return color;
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
        let color: [number, number, number, number] = [0, 0, 0, 0];
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
        let color = [...getColorFromWindSpeed(d.wind), selectedPoint && d.date_time === selectedPoint.date_time ? 255 : 128];
        if (selectedPoint && d.date_time === selectedPoint.date_time) {
            color = [255, 255, 255, 255];
        }
        return color as [number, number, number, number];
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
    const layers = [
        getScatterplotLayer(track_points, setHoverInfo, onChange, selectedPointActual, scatterplotSettings),
        getStormLineLayer(storms, lineSettings)
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

    onChange = async (evt: React.ChangeEvent<HTMLInputElement> | { target: { name: string; value?: any; checked?: boolean } }) => {
        if (evt.target.name === "name") {
            await this.setState({ name: evt.target.value });
        }
        if (evt.target.name === "minYear") {
            await this.setState({ minYear: evt.target.value });
        }
        else if (evt.target.name === "maxYear") {
            await this.setState({ maxYear: evt.target.value });
        }
        else if (evt.target.name === "minMonth") {
            await this.setState({ minMonth: evt.target.value });
        }
        else if (evt.target.name === "maxMonth") {
            await this.setState({ maxMonth: evt.target.value });
        }
        else if (evt.target.name === "minWind") {
            await this.setState({ minWind: evt.target.value });
        }
        else if (evt.target.name === "maxWind") {
            await this.setState({ maxWind: evt.target.value });
        }
        else if (evt.target.name === "filterByPressure") {
            await this.setState({ filterByPressure: evt.target.checked as boolean });
        }
        else if (evt.target.name === "minPressure") {
            await this.setState({ minPressure: evt.target.value });
        }
        else if (evt.target.name === "maxPressure") {
            await this.setState({ maxPressure: evt.target.value });
        }
        else if (evt.target.name === "systemStatus") {
            await this.setState({ systemStatus: evt.target.value });
        }
        else if (evt.target.name === "landfall") {
            await this.setState({ landfall: evt.target.checked as boolean });
        }
        else if (evt.target.name === "showMaxWindPoly") {
            await this.setState({ showMaxWindPoly: evt.target.checked as boolean });
        }
        else if (evt.target.name === "showWindPoly") {
            await this.setState({ showWindPoly: evt.target.checked as boolean });
        }
        else if (evt.target.name === "only6Hour") {
            await this.setState({ only6Hour: evt.target.checked as boolean });
        }
        else if (evt.target.name === "plotType") {
            await this.setState({ plotType: evt.target.value });
        }
        else if (evt.target.name === "basin") {
            await this.setState({ basin: evt.target.value });
        }
        else if (evt.target.name === "selectStorm") {
            await this.setState({ stormInfo: STORMS[evt.target.value.id] });
            const { minLat, maxLat, minLon, maxLon } = getNewViewPort(this.state.stormInfo!.track_points);
            const viewport = new WebMercatorViewport(this.state.viewState);
            const newViewport = viewport.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80 });
            const newViewState = {
                longitude: newViewport.longitude,
                latitude: newViewport.latitude,
                zoom: newViewport.zoom,
                pitch: newViewport.pitch,
                bearing: newViewport.bearing,
                ...(newViewport.padding && { padding: { ...newViewport.padding } })
            };
            await this.setState({ viewState: newViewState });
        }
        else if (evt.target.name === "selectedPoint") {
            await this.setState({ selectedPoint: parseInt(evt.target.value) });
        }
        else if (evt.target.name === "backwardSelectedPoint" && this.state.selectedPoint > 0) {
            await this.setState(prevState => ({ selectedPoint: (prevState.selectedPoint - 1) }));
        }
        else if (evt.target.name === "forwardSelectedPoint" && this.state.selectedPoint < this.state.stormInfo!.track_points.length - 1) {
            await this.setState(prevState => ({ selectedPoint: (prevState.selectedPoint + 1) }));
        }

        let dataSource: any;
        if (this.state.plotType === PLOT_TYPES.STORM) {
            dataSource = STORMS;
        } else {
            dataSource = Object.values(STORMS).flatMap(storm => storm["track_points"]);
            if (this.state.plotType === PLOT_TYPES.HEATMAP || this.state.plotType === PLOT_TYPES.GRID) {
                await this.setState({ only6Hour: true });
            }
            if (this.state.landfall) {
                await this.setState({ only6Hour: false });
            }
        }

        let data: any;
        if (Array.isArray(dataSource)) {
            data = dataSource
                .filter((point: Point) =>
                    (this.state.basin === "ALL" ? true : STORMS[point.id].basin === this.state.basin)
                    && point.year >= this.state.minYear
                    && point.year <= this.state.maxYear
                    && point.month >= this.state.minMonth
                    && point.month <= this.state.maxMonth
                    && point.wind >= this.state.minWind
                    && point.wind <= this.state.maxWind
                    && (this.state.filterByPressure ? point.pressure && point.pressure >= this.state.minPressure : true)
                    && (this.state.filterByPressure ? point.pressure && point.pressure <= this.state.maxPressure : true)
                    && (SYSTEM_STATUSES[this.state.systemStatus] ? point.status === SYSTEM_STATUSES[this.state.systemStatus] : true)
                    && (this.state.landfall ? point.record_type === "L" : true)
                    && (this.state.only6Hour ? point.minutes === 0 && point.hours % 6 === 0 : true));
        } else {
            data = Object.fromEntries(Object.entries(dataSource)
                .filter(([k, storm]: [string, Storm]) =>
                    (this.state.stormInfo ? this.state.stormInfo["id"] === storm["id"] : true)
                    && (this.state.basin === "ALL" ? true : storm.basin === this.state.basin)
                    && (this.state.name ? storm.name.startsWith(this.state.name.toUpperCase()) : true)
                    && storm.season >= this.state.minYear
                    && storm.season <= this.state.maxYear
                    && storm.track_points[0].month >= this.state.minMonth
                    && storm.track_points[storm.track_points.length - 1].month <= this.state.maxMonth
                    && storm.max_wind >= this.state.minWind
                    && storm.max_wind <= this.state.maxWind
                    && (this.state.filterByPressure ? storm.min_pressure && storm.min_pressure >= this.state.minPressure : true)
                    && (this.state.filterByPressure ? storm.min_pressure && storm.min_pressure <= this.state.maxPressure : true)
                    && (SYSTEM_STATUSES[this.state.systemStatus] ? storm.status_list.includes(SYSTEM_STATUSES[this.state.systemStatus]) : true)
                    && (this.state.landfall ? storm.record_type_list.includes("L") : true));
        }

        let layers: any[];
        if (this.state.plotType === PLOT_TYPES.STORM) {
            layers = getStormLayers(
                data,
                (hoverInfo: any) => this.setState({ hoverInfo }),
                this.onChange,
                this.state.showMaxWindPoly,
                this.state.showWindPoly,
                this.state.stormInfo,
                this.state.selectedPoint,
                this.state.scatterplotSettings,
                this.state.lineSettings
            );
        } else if (this.state.plotType === PLOT_TYPES.HEATMAP) {
            layers = getHeatmapLayer(data, this.state.heatmapSettings);
        } else if (this.state.plotType === PLOT_TYPES.GRID) {
            layers = getGridLayer(data, this.state.gridSettings);
        } else if (this.state.plotType === PLOT_TYPES.MAX_WIND_GRID) {
            layers = getGridLayerMaxWind(data, this.state.gridSettings);
        } else {
            layers = getScatterplotLayer(
                data,
                (hoverInfo: any) => this.setState({ hoverInfo }),
                () => { },
                null,
                this.state.scatterplotSettings
            );
        }

        this.setState({
            dataSource,
            data,
            layers
        });
    };

    onSettingsChange = async (evt: React.ChangeEvent<HTMLInputElement>, settings: any) => {
        await this.setState(prevState => ({
            [settings.name]: {
                ...prevState[settings.name],
                [evt.target.name]: parseFloat(evt.target.value)
            }
        }));
        await this.onChange({ target: { name: this.state.plotType } });
    };

    updateDimensions = () => {
        if (this.divElement) {
            const height = this.divElement.clientHeight;
            const width = this.divElement.clientWidth;
            this.setState({
                height,
                width,
                viewState: new WebMercatorViewport({
                    height,
                    width,
                    longitude: -64,
                    latitude: 26,
                    zoom: 3,
                    pitch: 0,
                    bearing: 0
                }),
            });
        }
    };

    componentDidMount() {
        let minW = 999;
        let maxW = 0;
        let minP = 9999;
        let maxP = 0;
        Object.values(STORMS).flatMap((storm: Storm) => storm["track_points"]).forEach((point: Point) => {
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
        console.log(minW, maxW, minP, maxP);
        window.addEventListener('resize', () => {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }
            this.resizeTimeout = window.setTimeout(this.updateDimensions, 100);
        });
        this.updateDimensions();
        this.onChange({ target: { name: PLOT_TYPES.STORM } });
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.updateDimensions);
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
    }

    getToolTip = (object: any) => {
        if (!object) { return; }
        if (this.state.plotType === "Max Wind Grid") {
            return `Max Wind: ${object.colorValue}`;
        }
        if (this.state.plotType === "Grid") {
            return `# of track points: ${object.colorValue}`;
        }
    };

    render() {
        return (
            <div style={{ width: "100vw", height: "100vh" }} ref={(divElement) => { this.divElement = divElement }}>
                <DeckGL
                    viewState={this.state.viewState}
                    controller={true}
                    onViewStateChange={({ viewState }) => this.setState({ viewState })}
                    layers={this.state.layers}
                    getTooltip={({ object }) => this.getToolTip(object)}
                >
                    <Map
                        reuseMaps
                        mapboxAccessToken={CREDENTIALS["MAP_TOKEN"]}
                        mapStyle="mapbox://styles/mapbox/dark-v9"
                    />

                    {this.state.hoverInfo && this.state.hoverInfo.object && (
                        <div
                            style={{
                                position: 'absolute',
                                left: this.state.hoverInfo.x,
                                top: this.state.hoverInfo.y,
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
                                <p>Name: {STORMS[this.state.hoverInfo.object["id"]]["name"]}</p>
                                <p>Date: {this.state.hoverInfo.object["date_time"].split(" ")[0]}</p>
                                <p>Longitude: {this.state.hoverInfo.object["longitude"]}</p>
                                <p>Wind: {this.state.hoverInfo.object["wind"]}</p>
                                {this.state.hoverInfo.object["max_wind_radius"] && <p>Max Wind Radius: {this.state.hoverInfo.object["max_wind_radius"]}</p>}
                            </div>
                            <div className="column" style={{ paddingLeft: 10 }}>
                                <p>Season: {STORMS[this.state.hoverInfo.object["id"]]["season"]}</p>
                                <p>Time: {this.state.hoverInfo.object["date_time"].split(" ")[1]}</p>
                                <p>Latitude: {this.state.hoverInfo.object["latitude"]}</p>
                                <p>Status: {this.state.hoverInfo.object["status"]}</p>
                                {this.state.hoverInfo.object["pressure"] && <p>Pressure: {this.state.hoverInfo.object["pressure"]}</p>}
                            </div>
                        </div>
                    )}
                </DeckGL>
                {this.state.stormInfo && (
                    <StormInfo
                        stormInfo={this.state.stormInfo}
                        selectedPoint={this.state.selectedPoint}
                        onChange={this.onChange}
                        exitStormInfo={async (evt) => {
                            await this.setState({ stormInfo: null, selectedPoint: 0 });
                            this.onChange(evt);
                        }}
                    />
                )}
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
                    onChange={(evt: React.ChangeEvent<HTMLInputElement>) => this.onChange(evt)}
                    toggleFilterPanel={() => { this.setState(prevState => ({ filterPanelOpen: !prevState.filterPanelOpen })) }}
                />
                <SettingsPanel
                    settingsOpen={this.state.settingsOpen}
                    onSettingsChange={this.onSettingsChange}
                    toggleSettingsPanel={() => { this.setState(prevState => ({ settingsOpen: !prevState.settingsOpen })) }}
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