'use client';

import React, { Component, ChangeEvent } from 'react';
import DeckGL from '@deck.gl/react';
import { GridLayer, HeatmapLayer } from '@deck.gl/aggregation-layers';
import { LineLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import {Layer, WebMercatorViewport} from '@deck.gl/core';
import Map from 'react-map-gl/mapbox';
import STORMS from './data/storms_with_ir.json';
import FilterPanel from "./filter-panel";
import CREDENTIALS from "../credentials.json";
import StormInfo from "./storm-info";
import SettingsPanel, {
    GridSettings,
    HeatmapSettings,
    LayerSettings,
    LineSettings,
    ScatterplotSettings
} from "./settings-panel";

interface TrackPoint {
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
    max_wind_poly?: number[][];
    [key: string]: any;
}

interface Storm {
    id: string;
    name: string;
    basin: string;
    season: number;
    track_points: TrackPoint[];
    max_wind: number;
    min_pressure?: number;
    status_list: string[];
    record_type_list: string[];
}

interface LineData {
    color: [number, number, number] | [number, number, number, number]; // RGB or RGBA tuple
    id: string;
    from: [number, number];
    to: [number, number];
}

export enum PlotType {
    STORM = "Storm",
    SCATTER_PLOT = "Scatter Plot",
    HEATMAP = "Heatmap",
    GRID = "Grid",
    MAX_WIND_GRID = "Max Wind Grid"
}

export enum Basin {
    ALL = "All",
    AL = "North Atlantic",
    EP = "East Pacific",
    CP = "Central Pacific"
}

export enum SystemStatus {
    NONE = "",
    TD = "Tropical Depression",
    TS = "Tropical Storm",
    HU = "Hurricane",
    EX = "Extra-Tropical",
    SD = "Sub-Tropical Depression",
    SS = "Sub-Tropical Storm",
    LO = "Low",
    DB = "Disturbance"
}

interface AppState {
    height: number;
    width: number;
    viewState: {
        longitude: number;
        latitude: number;
        zoom: number;
        pitch: number;
        bearing: number;
        width?: number;
        height?: number;
    };
    scatterplotSettings: ScatterplotSettings;
    lineSettings: LineSettings;
    gridSettings: GridSettings;
    heatmapSettings: HeatmapSettings;
    plotType: PlotType;
    basin: Basin;
    dataSource: Storm[] | TrackPoint[];
    data: Storm[] | TrackPoint[];
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
    systemStatus: SystemStatus;
    landfall: boolean;
    showMaxWindPoly: boolean;
    showWindPoly: boolean;
    only6Hour: boolean;
    hoverInfo?: HoverInfo;
    stormInfo: Storm | null;
    selectedPoint: number;
    filterPanelOpen: boolean;
    settingsOpen: boolean;
    layers: Layer[];
}

interface HoverInfo {
    x: number;
    y: number;
    object?: TrackPoint;
}

const SYSTEM_STATUS_MAP = {
    [SystemStatus.NONE]: "",
    [SystemStatus.TD]: "TD",
    [SystemStatus.TS]: "TS",
    [SystemStatus.HU]: "HU",
    [SystemStatus.EX]: "EX",
    [SystemStatus.SD]: "SD",
    [SystemStatus.SS]: "SS",
    [SystemStatus.LO]: "LO",
    [SystemStatus.DB]: "DB"
};

const BASIN_MAP: Record<Basin, string> = {
    "All": "All Basins",
    "North Atlantic": "North Atlantic Region",
    "East Pacific": "East Pacific Region",
    "Central Pacific": "Central Pacific Region"
};

export const getColorFromWindSpeed = (windspeed: number): [number, number, number] => {
    if (windspeed >= 137) return [196, 100, 217];
    if (windspeed >= 113) return [255, 96, 96];
    if (windspeed >= 96) return [255, 143, 32];
    if (windspeed >= 83) return [255, 216, 33];
    if (windspeed >= 64) return [255, 247, 149];
    if (windspeed >= 34) return [0, 250, 244];
    return [94, 186, 255];
};

const getLineDataFromStormTrackPoints = (storms: Storm[]): LineData[] => {
    return storms.flatMap(storm =>
        storm.track_points.slice(0, -1).map((point, i) => ({
            color: [...getColorFromWindSpeed(point.wind), 200] as [number, number, number, number],
            id: point.id,
            from: [point.longitude, point.latitude],
            to: [storm.track_points[i + 1].longitude, storm.track_points[i + 1].latitude]
        }))
    );
};

const getStormLineLayer = (storms: Storm[], settings: LayerSettings): LineLayer<LineData> => new LineLayer({
    id: 'line-layer',
    data: getLineDataFromStormTrackPoints(Object.values(storms)),
    pickable: false,
    getSourcePosition: d => d.from,
    getTargetPosition: d => d.to,
    getColor: d => d.color,
    ...settings
});

const getMaxWindAreaLayer = (trackPoints: TrackPoint[]): PolygonLayer<TrackPoint> => new PolygonLayer({
    id: 'polygon-layer',
    data: trackPoints,
    lineWidthMinPixels: 1,
    getPolygon: point => point.max_wind_poly,
    getFillColor: point => [...getColorFromWindSpeed(point.wind), 60] as [number, number, number, number],
    getLineColor: [0, 0, 0, 0]
});

const WIND_AREA_KEYS = [
    "34_ne_poly", "34_se_poly", "34_sw_poly", "34_nw_poly",
    "50_ne_poly", "50_se_poly", "50_sw_poly", "50_nw_poly",
    "64_ne_poly", "64_se_poly", "64_sw_poly", "64_nw_poly"
];

const getWindAreaLayers = (trackPoints: TrackPoint[], selectedPoint?: TrackPoint): PolygonLayer<TrackPoint>[] =>
    WIND_AREA_KEYS.map(key => new PolygonLayer({
        id: `polygon-layer-${key}`,
        data: trackPoints.filter(point => point[key]),
        lineWidthMinPixels: 1,
        getPolygon: point => point[key],
        getFillColor: d => {
            let color = [0, 0, 0, 0];
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
            return color as [number, number, number, number];
        },
        getLineColor: [0, 0, 0, 0]
    }));

const getScatterplotLayer = (
    trackPoints: TrackPoint[],
    setHoverInfo: (info: HoverInfo) => void,
    onChange: (evt: ChangeEvent<HTMLInputElement>) => void,
    selectedPoint?: TrackPoint,
    settings?: LayerSettings
): ScatterplotLayer<TrackPoint> => new ScatterplotLayer({
    id: 'scatterplot-layer',
    getPosition: d => [d.longitude, d.latitude],
    getFillColor: d => {
        const color = getColorFromWindSpeed(d.wind);
        if (selectedPoint) {
            return d.date_time === selectedPoint.date_time ? [255, 255, 255] : [...color, 128];
        }
        return color;
    },
    getLineColor: d => {
        if (selectedPoint && d.date_time === selectedPoint.date_time) {
            return getColorFromWindSpeed(d.wind);
        }
        return [0, 0, 0, 0];
    },
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    data: trackPoints,
    pickable: true,
    onHover: info => setHoverInfo(info),
    onClick: info => onChange({ target: { name: "selectStorm", value: info.object } } as ChangeEvent<HTMLInputElement>),
    ...settings
});

const getHeatmapLayer = (trackPoints: TrackPoint[], settings: HeatmapSettings): HeatmapLayer<TrackPoint> => new HeatmapLayer({
    id: 'heatmapLayer',
    data: trackPoints,
    getPosition: d => [d.longitude, d.latitude],
    getWeight: d => 1,
    aggregation: 'SUM',
    ...settings
});

const getGridLayer = (trackPoints: TrackPoint[], settings: GridSettings): GridLayer<TrackPoint> => new GridLayer({
    id: 'grid-layer',
    data: trackPoints,
    pickable: true,
    extruded: true,
    colorRange: [
        [255, 255, 204, 128], [255, 237, 160, 128],
        [254, 217, 118, 128], [254, 178, 76, 128],
        [253, 141, 60, 128], [252, 78, 42, 128],
        [227, 26, 28, 128], [189, 0, 38, 128],
        [128, 0, 38, 128]
    ],
    getPosition: d => [d.longitude, d.latitude],
    ...settings
});

const getGridLayerMaxWind = (trackPoints: TrackPoint[], settings: GridSettings): GridLayer<TrackPoint> => new GridLayer({
    id: 'max-wind-grid-layer',
    data: trackPoints,
    pickable: true,
    extruded: true,
    colorRange: [
        [255, 255, 204, 128], [255, 237, 160, 128],
        [254, 217, 118, 128], [254, 178, 76, 128],
        [253, 141, 60, 128], [252, 78, 42, 128],
        [227, 26, 28, 128], [189, 0, 38, 128],
        [128, 0, 38, 128]
    ],
    getPosition: d => [d.longitude, d.latitude],
    getElevationWeight: p => p.wind,
    getColorWeight: p => p.wind,
    colorAggregation: 'MAX',
    elevationAggregation: 'MAX',
    ...settings
});

// Cast the imported data to a proper type
type StormsData = Record<string, Storm>; // If STORMS is an object with storm IDs as keys
const typedStorms = STORMS as StormsData;

class Hurricane extends Component<{}, AppState> {
    private divElement: HTMLDivElement | null = null;
    private resizeTimeout?: number;

    state: AppState = {
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
        plotType: PlotType.STORM,
        basin: Basin.ALL,
        dataSource: Object.values(typedStorms),
        data: Object.values(typedStorms),
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
        systemStatus: SystemStatus.NONE,
        landfall: false,
        showMaxWindPoly: false,
        showWindPoly: false,
        only6Hour: false,
        hoverInfo: undefined,
        stormInfo: null,
        selectedPoint: 0,
        filterPanelOpen: true,
        settingsOpen: false,
        layers: []
    };

    componentDidMount() {
        this.initializeData();
        window.addEventListener('resize', this.handleResize);
        this.updateDimensions();
        this.handleChange({ target: { name: PlotType.STORM } } as ChangeEvent<HTMLInputElement>);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
        if (this.resizeTimeout) window.clearTimeout(this.resizeTimeout);
    }

    private initializeData = () => {
        const trackPoints = Object.values(STORMS).flatMap(storm => storm.track_points);
        const winds = trackPoints.map(p => p.wind);
        const pressures = trackPoints.filter(p => p.pressure).map(p => p.pressure!);

        this.setState({
            minWind: Math.min(...winds),
            maxWind: Math.max(...winds),
            minPressure: pressures.length ? Math.min(...pressures) : 870,
            maxPressure: pressures.length ? Math.max(...pressures) : 1024
        });
    };

    private handleResize = () => {
        if (this.resizeTimeout) window.clearTimeout(this.resizeTimeout);
        this.resizeTimeout = window.setTimeout(this.updateDimensions, 100);
    };

    // Add the getNewViewPort function
    private getNewViewPort = (trackPoints: TrackPoint[]) => {
        const lats = trackPoints.map(p => p.latitude);
        const lons = trackPoints.map(p => p.longitude);
        return {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLon: Math.min(...lons),
            maxLon: Math.max(...lons)
        };
    };

    // Update the handleChange method in the Hurricane component
    private handleChange = async (evt: React.ChangeEvent<HTMLInputElement | HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>) => {
        console.log(evt)
        let target: HTMLInputElement | HTMLSelectElement | HTMLButtonElement;
        let name: string;
        let value: any;

        if (evt.type === 'click') {
            // Handle button clicks
            target = evt.currentTarget as HTMLButtonElement;
            name = target.name;
            value = target.value;
        } else {
            // Handle input changes
            target = evt.target as HTMLInputElement | HTMLSelectElement;
            name = target.name;
            value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
        }

        if (name === "selectStorm") {
            const trackPoint = value as TrackPoint;
            const storm = typedStorms[trackPoint.id];
            await this.setState({ stormInfo: storm, selectedPoint: 0 });

            // Calculate new viewport based on storm's track points
            const { minLat, maxLat, minLon, maxLon } = this.getNewViewPort(storm.track_points);
            const tempViewport = new WebMercatorViewport({
                ...this.state.viewState,
                width: this.state.width,
                height: this.state.height
            });
            const newViewState = tempViewport.fitBounds(
                [[minLon, minLat], [maxLon, maxLat]],
                { padding: 80 }
            );

            await this.setState({
                viewState: {
                    longitude: newViewState.longitude,
                    latitude: newViewState.latitude,
                    zoom: newViewState.zoom,
                    pitch: newViewState.pitch,
                    bearing: newViewState.bearing
                }
            });
            this.updateLayers();
        } else if (name === "selectedPoint") {
            const newIndex = parseInt(value as string);
            await this.setState({ selectedPoint: newIndex });
            this.updateViewport();
        } else if (name === "backwardSelectedPoint") {
            if (this.state.selectedPoint > 0) {
                await this.setState(prevState => ({ selectedPoint: prevState.selectedPoint - 1 }));
                this.updateViewport();
            }
        } else if (name === "forwardSelectedPoint") {
            if (this.state.stormInfo && this.state.selectedPoint < this.state.stormInfo.track_points.length - 1) {
                await this.setState(prevState => ({ selectedPoint: prevState.selectedPoint + 1 }));
                this.updateViewport();
            }
        } else {
            // Handle general state updates
            await this.setState(prevState => ({
                ...prevState,
                [name]: value
            }));
            this.updateLayers();
        }
    };

    private updateLayers = () => {
        const { plotType } = this.state;
        let data: Storm[] | TrackPoint[] = [];
        if (plotType === PlotType.STORM) {
            data = this.filterStorms();
        } else {
            data = this.filterTrackPoints();
        }

        const layers = this.createLayers(data);
        this.setState({ layers });
    };

    private filterStorms = (): Storm[] => {
        const { basin, name, minYear, maxYear, minMonth, maxMonth, minWind, maxWind, filterByPressure, minPressure, maxPressure, systemStatus, landfall } = this.state;
        return Object.values(typedStorms).filter((storm: Storm) => {
            const firstPoint = storm.track_points[0];
            const lastPoint = storm.track_points[storm.track_points.length - 1];

            return (
                (basin === Basin.ALL || storm.basin === basin) &&
                (name ? storm.name.startsWith(name.toUpperCase()) : true) &&
                storm.season >= minYear &&
                storm.season <= maxYear &&
                firstPoint.month >= minMonth &&
                lastPoint.month <= maxMonth &&
                storm.max_wind >= minWind &&
                storm.max_wind <= maxWind &&
                // Combined pressure checks
                (!filterByPressure || (
                    storm.min_pressure !== undefined &&
                    storm.min_pressure >= minPressure &&
                    storm.min_pressure <= maxPressure
                )) &&
                (systemStatus === SystemStatus.NONE || storm.status_list.includes(SYSTEM_STATUS_MAP[systemStatus])) &&
                (!landfall || storm.record_type_list.includes("L"))
            );
        });
    };

    private filterTrackPoints = (): TrackPoint[] => {
        const { basin, minYear, maxYear, minMonth, maxMonth, minWind, maxWind, minPressure, maxPressure, filterByPressure, systemStatus, landfall, only6Hour } = this.state;
        return Object.values(typedStorms)
            .flatMap(storm => storm.track_points)
            .filter((point: TrackPoint) => {
                const storm = typedStorms[point.id];

                return (
                    (basin === Basin.ALL || storm?.basin === basin) &&
                    point.year >= minYear &&
                    point.year <= maxYear &&
                    point.month >= minMonth &&
                    point.month <= maxMonth &&
                    point.wind >= minWind &&
                    point.wind <= maxWind &&
                    // Combined pressure checks
                    (!filterByPressure || (
                        point.pressure !== undefined &&
                        point.pressure >= minPressure &&
                        point.pressure <= maxPressure
                    )) &&
                    (systemStatus === SystemStatus.NONE || point.status === SYSTEM_STATUS_MAP[systemStatus]) &&
                    (!landfall || point.record_type === "L") &&
                    (!only6Hour || (point.minutes === 0 && point.hours % 6 === 0))
                );
            });
    };

    private createLayers = (data: Storm[] | TrackPoint[]): Layer[] => {
        const { plotType, showMaxWindPoly, showWindPoly, stormInfo, selectedPoint } = this.state;

        if (plotType === PlotType.STORM) {
            const storms = data as Storm[];
            const trackPoints = storms.flatMap(storm => storm.track_points);
            const selectedPointActual = stormInfo?.track_points[selectedPoint];

            const layers: Layer[] = [
                getScatterplotLayer(
                    trackPoints,
                    info => this.setState({ hoverInfo: info }),
                    this.handleChange,
                    selectedPointActual,
                    this.state.scatterplotSettings
                ),
                getStormLineLayer(storms, this.state.lineSettings)
            ];

            if (showMaxWindPoly) {
                layers.push(getMaxWindAreaLayer(trackPoints.filter(p => p.max_wind_poly)));
            }

            if (showWindPoly) {
                layers.push(...getWindAreaLayers(trackPoints, selectedPointActual));
            }

            return layers;
        }

        const trackPoints = data as TrackPoint[];

        switch (plotType) {
            case PlotType.HEATMAP:
                return [getHeatmapLayer(trackPoints, this.state.heatmapSettings)];
            case PlotType.GRID:
                return [getGridLayer(trackPoints, this.state.gridSettings)];
            case PlotType.MAX_WIND_GRID:
                return [getGridLayerMaxWind(trackPoints, this.state.gridSettings)];
            case PlotType.SCATTER_PLOT:
            default:
                return [getScatterplotLayer(
                    trackPoints,
                    info => this.setState({ hoverInfo: info }),
                    this.handleChange,
                    undefined,
                    this.state.scatterplotSettings
                )];
        }
    };

    private getTooltip = (object?: any): string | null => {
        if (!object) return null;

        switch (this.state.plotType) {
            case PlotType.MAX_WIND_GRID:
                return `Max Wind: ${object.colorValue} kt`;
            case PlotType.GRID:
                return `Count: ${object.colorValue}`;
            default:
                return null;
        }
    };

    private updateSelectedPoint = (newIndex: number) => {
        this.setState({ selectedPoint: newIndex }, this.updateViewport);
    };

    // Update the updateViewport method
    private updateViewport = () => {
        if (this.state.stormInfo) {
            const { track_points } = this.state.stormInfo;
            const point = track_points[this.state.selectedPoint];

            this.setState(prevState => {
                // Create a temporary viewport instance
                const tempViewport = new WebMercatorViewport({
                    ...prevState.viewState,
                    width: prevState.width,
                    height: prevState.height
                });

                // Calculate new viewport
                const newViewport = tempViewport.fitBounds(
                    [
                        [point.longitude - 5, point.latitude - 5],
                        [point.longitude + 5, point.latitude + 5]
                    ],
                    { padding: 80 }
                );

                // Return plain object with updated values
                return {
                    viewState: {
                        longitude: newViewport.longitude,
                        latitude: newViewport.latitude,
                        zoom: newViewport.zoom,
                        pitch: newViewport.pitch,
                        bearing: newViewport.bearing
                    }
                };
            });
        }
    };

    // Update the updateDimensions method
    private updateDimensions = () => {
        if (!this.divElement) return;

        const { clientHeight: height, clientWidth: width } = this.divElement;

        const tempViewport = new WebMercatorViewport({
            width,
            height,
            longitude: -64,
            latitude: 26,
            zoom: 3,
            pitch: 0,
            bearing: 0
        });

        this.setState({
            height,
            width,
            viewState: {  // Store as plain object
                longitude: tempViewport.longitude,
                latitude: tempViewport.latitude,
                zoom: tempViewport.zoom,
                pitch: tempViewport.pitch,
                bearing: tempViewport.bearing
            }
        });
    };

    private handleExitStormInfo = () => {
        this.setState({
            stormInfo: null,
            selectedPoint: 0,
            viewState: new WebMercatorViewport({
                longitude: -64,
                latitude: 26,
                zoom: 3,
                pitch: 0,
                bearing: 0
            })
        }, this.updateLayers);
    };

    private handleSettingsChange = (
        evt: React.ChangeEvent<HTMLInputElement>,
        settings: LayerSettings
    ) => {
        const { name, value } = evt.target;
        const parsedValue = parseFloat(value);
        const settingsKey = settings.name as keyof AppState;

        this.setState(prevState => ({
            ...prevState,
            [settingsKey]: {
                ...(prevState[settingsKey] as object), // Type assertion to resolve TS2698
                [name]: parsedValue
            }
        }), this.updateLayers);
    };

    private toggleFilterPanel = () => {
        this.setState(prev => ({ filterPanelOpen: !prev.filterPanelOpen }));
    };

    private toggleSettingsPanel = () => {
        this.setState(prev => ({ settingsOpen: !prev.settingsOpen }));
    };

    render() {
        const { hoverInfo, stormInfo, plotType, layers, viewState, filterPanelOpen, settingsOpen } = this.state;
        const trackPoint = hoverInfo?.object;

        return (
            <div
                ref={element => {
                    this.divElement = element;
                }}
                style={{ width: '100vw', height: '100vh' }}
            >
                <DeckGL
                    initialViewState={viewState}
                    controller={true}
                    layers={layers}
                    getTooltip={({ object }) => this.getTooltip(object)}
                >
                    <Map
                        reuseMaps
                        mapboxAccessToken={CREDENTIALS.MAP_TOKEN}
                        mapStyle="mapbox://styles/mapbox/dark-v9"
                    />

                    {trackPoint && (
                        <div className="tooltip" style={{
                            position: 'absolute',
                            zIndex: 1,
                            pointerEvents: 'none',
                            left: hoverInfo.x,
                            top: hoverInfo.y,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: '8px',
                            color: 'white',
                            borderRadius: '4px'
                        }}>
                            <div>Storm: {typedStorms[trackPoint.id].name}</div>
                            <div>Date: {new Date(trackPoint.date_time).toLocaleDateString()}</div>
                            <div>Wind: {trackPoint.wind} kt</div>
                            {trackPoint.pressure && <div>Pressure: {trackPoint.pressure} hPa</div>}
                        </div>
                    )}
                </DeckGL>
                <div style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 100,
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    padding: '10px',
                    borderRadius: '8px'
                }}>
                    <FilterPanel
                        plotType={plotType}
                        plotTypeOptions={PlotType}
                        basin={this.state.basin}
                        basinOptions={BASIN_MAP}
                        name={this.state.name}
                        systemStatus={this.state.systemStatus}
                        systemStatusOptions={SYSTEM_STATUS_MAP}
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
                        filterPanelOpen={filterPanelOpen}
                        toggleFilterPanel={this.toggleFilterPanel}
                        onChange={this.handleChange}
                    />

                    <SettingsPanel
                        settingsOpen={settingsOpen}
                        plotType={plotType}
                        scatterplotSettings={this.state.scatterplotSettings}
                        lineSettings={this.state.lineSettings}
                        gridSettings={this.state.gridSettings}
                        heatmapSettings={this.state.heatmapSettings}
                        onSettingsChange={this.handleSettingsChange}
                        toggleSettingsPanel={this.toggleSettingsPanel}
                    />
                </div>
                {stormInfo && (
                    <StormInfo
                        stormInfo={stormInfo}
                        selectedPoint={this.state.selectedPoint}
                        onChange={this.handleChange}
                        exitStormInfo={this.handleExitStormInfo}
                    />
                )}
            </div>
        );
    }
}

export default Hurricane;