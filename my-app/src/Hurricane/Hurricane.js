import React, {Component} from 'react';
import DeckGL from '@deck.gl/react';
import {GridLayer, HexagonLayer, HeatmapLayer} from '@deck.gl/aggregation-layers';
import {LineLayer, PolygonLayer, ScatterplotLayer} from '@deck.gl/layers';
import {Map} from 'react-map-gl';
import TRACK_POINTS from './track_points.json';
import STORMS from './storms.json';
import ControlPanel from "./control-panel";
import {MAP_TOKEN} from "../credentials"
import StormInfo from "./storm-info";
import stormInfo from "./storm-info";

/*
Settings
Layers
    Trackpoint
        /Scatterplot
            Settings
        /Heatmap
            Settings
        //GridLayer/HexagonLayer
            /Number of points (heatmap)
            /Max Wind
            Min Pressure
    /Storms
        Storm display
            Graph of storm winds/pressure
            Link to storm
            
        /LineLayer
Filters
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
 */

const NON_HIGHLIGHT_ALPHA = 20;

const PLOT_TYPES = {
    STORM: "Storm",
    SCATTER_PLOT: "Scatter Plot",
    HEATMAP: "Heatmap",
    GRID: "Grid",
    MAX_WIND_GRID: "Max Wind Grid"
};

const AGGREGATE_LAYERS = [PLOT_TYPES.HEATMAP, PLOT_TYPES.GRID];

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

// Viewport settings
const INITIAL_VIEW_STATE = {
    longitude: -64,
    latitude: 26,
    zoom: 3,
    pitch: 0,
    bearing: 0
};

const getColorFromWindSpeed = (windspeed) => {
    if (windspeed >= 137) {
        return [196, 100, 217, 255];
    }
    if (windspeed >= 113) {
        return [255, 96, 96, 255];
    }
    if (windspeed >= 96) {
        return [255, 143, 32, 255];
    }
    if (windspeed >= 83) {
        return [255, 216, 33, 255];
    }
    if (windspeed >= 64) {
        return [255, 247, 149, 255];
    }
    if (windspeed >= 34) {
        return [0, 250, 244, 255];
    }
    return [94, 186, 255, 255];
};

const getLineDataFromStormTrackPoints = (storms) => {
    const line_list = []
    storms.forEach(storm => {
        const trackpoints = storm["track_points"]
        for (let i = 0; i < trackpoints.length - 1; i++) {
            const line = {
                color: getColorFromWindSpeed(trackpoints[i].wind),
                id: trackpoints["id"],
                from: [trackpoints[i]["longitude"], trackpoints[i]["latitude"]],
                to: [trackpoints[i + 1]["longitude"], trackpoints[i + 1]["latitude"]]
            }
            line_list.push(line);
        }
    });
    return line_list
};

const getStormLineLayer = (storms) => new LineLayer({
    id: 'line-layer',
    data: getLineDataFromStormTrackPoints(Object.values(storms)),
    pickable: false,
    getWidth: 1,
    getSourcePosition: d => d.from,
    getTargetPosition: d => d.to,
    getColor: d => d.color
});

const getMaxWindAreaLayer = (track_points) => new PolygonLayer({
    id: 'polygon-layer',
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

const getWindAreaLayers = (track_points) => {
    return wind_area_keys.map(key => getWindAreaLayer(track_points.filter(point => point[key]), key));
}
const getWindAreaLayer = (track_points, key) => new PolygonLayer({
    id: 'polygon-layer',
    data: track_points,
    lineWidthMinPixels: 1,
    getPolygon: point => point[key],
    getFillColor: d => {
        if (key.startsWith("64")) {
            return [255, 247, 149, 40];
        }
        if (key.startsWith("50")) {
            return [0, 250, 244, 30];
        }
        return [94, 186, 255, 20];
    },
    getLineColor: [0, 0, 0, 0]
});

const getScatterplotLayer = (track_points, setHoverInfo, onChange) => new ScatterplotLayer({
    id: 'scatterplot-layer',
    getPosition: d => [d.longitude, d.latitude],
    getColor: d => getColorFromWindSpeed(d.wind),
    radiusScale: 6,
    radiusMinPixels: 2,
    radiusMaxPixels: 50,
    data: track_points,
    pickable: true,
    onHover: info => setHoverInfo(info),
    onClick: info => onChange({ target: { name: "selectStorm", value: info.object }})
});

const getHeatmapLayer = (track_points) => new HeatmapLayer({
    id: 'heatmapLayer',
    data: track_points,
    getPosition: d => [d.longitude, d.latitude],
    getWeight: d => 1, // MAYBE ACE/WIND/PRESSURE in the future?
    aggregation: 'SUM'
});

const getGridLayer = (track_points) => new GridLayer({
    id: 'new-grid-layer',
    data: track_points,
    pickable: true,
    extruded: true,
    cellSize: 100000,
    elevationScale: 400,
    colorRange: [[255,255,204,128],[255,237,160,128],[254,217,118,128],[254,178,76,128],[253,141,60,128],[252,78,42,128] ,[227,26,28,128],[189,0,38,128],[128,0,38,128]],
    getPosition: d => [d.longitude, d.latitude]
});


const getGridLayerMaxWind = (track_points) => new HexagonLayer({
    id: 'new-grid-layer',
    data: track_points,
    pickable: true,
    extruded: true,
    cellSize: 100000,
    radius: 100000,
    elevationScale: 400,
    colorRange: [[255,255,204,128],[255,237,160,128],[254,217,118,128],[254,178,76,128],[253,141,60,128],[252,78,42,128] ,[227,26,28,128],[189,0,38,128],[128,0,38,128]],
    getPosition: d => [d.longitude, d.latitude],
    getElevationWeight: p => p.wind,
    getColorWeight: p => p.wind,
    colorAggregation: 'MAX',
    elevationAggregation: 'MAX'
});

const getStormLayers = (storms, setHoverInfo, onChange, showMaxWindPoly, showWindPoly) => {
    const track_points = Object.values(storms).flatMap(storm => storm["track_points"]);
    const layers = [
        getScatterplotLayer(track_points, setHoverInfo, onChange),
        getStormLineLayer(storms)
    ];
    if (showMaxWindPoly) {
        layers.push(
            getMaxWindAreaLayer(track_points.filter(track_point => track_point.max_wind_poly))
        )
    }
    if (showWindPoly) {
        layers.push(
            getWindAreaLayers(track_points)
        )
    }
    return layers;
};

class Hurricane extends Component {
    state = {
        plotType: PLOT_TYPES.STORM,
        dataSource: STORMS,
        data: STORMS,
        minYear: 1851,
        maxYear: 2021,
        minMonth: 1,
        maxMonth: 12,
        minWind: 0,
        maxWind: 165,
        filterByPressure: false,
        minPressure: 882, // Only out 22,558 points of 53,501 points have pressure
        maxPressure: 1024, // Only 1,186 storms out of 1,936 storms have at leasy one pressure reading
        systemStatus: SYSTEM_STATUSES.None,
        landfall: false,
        showMaxWindPoly: false,
        showWindPoly: false,
        only6Hour: false,
        hoverInfo: {},
        stormInfo: {},
        layers: []
    }

    onChange = async (evt) => {
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
            await this.setState({ filterByPressure: evt.target.checked });
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
            await this.setState({ landfall: evt.target.checked });
        }
        else if (evt.target.name === "showMaxWindPoly") {
            await this.setState({ showMaxWindPoly: evt.target.checked });
        }
        else if (evt.target.name === "showWindPoly") {
            await this.setState({ showWindPoly: evt.target.checked });
        }
        else if (evt.target.name === "only6Hour") {
            await this.setState({ only6Hour: evt.target.checked });
        }
        else if (evt.target.name === "plotType") {
            await this.setState({ plotType: evt.target.value });
        }
        else if (evt.target.name === "selectStorm") {
            await this.setState({ stormInfo: evt.target.value });
        }
        let dataSource;
        if (this.state.plotType === PLOT_TYPES.STORM) {
            dataSource = STORMS;
        } else {
            dataSource = TRACK_POINTS;
            // For aggregation layers we need to remove none 6 hours points so its unbiased
            if (this.state.plotType === PLOT_TYPES.HEATMAP || this.state.plotType === PLOT_TYPES.GRID) {
                await this.setState({ only6Hour: true });
            }
            if (this.state.landfall) {
                await this.setState({ only6Hour: false });
            }
        }
        let data;
        if (Array.isArray(dataSource)) { // Track points
            data = dataSource
                .filter(point => point.year >= this.state.minYear
                    && point.year <= this.state.maxYear
                    && point.month >= this.state.minMonth
                    && point.month <= this.state.maxMonth
                    && point.wind >= this.state.minWind
                    && point.wind <= this.state.maxWind
                    && (this.state.filterByPressure ? point.pressure && point.pressure >= this.state.minPressure : true)
                    && (this.state.filterByPressure ? point.pressure && point.pressure <= this.state.maxPressure : true)
                    && (SYSTEM_STATUSES[this.state.systemStatus] ? point.status === SYSTEM_STATUSES[this.state.systemStatus] : true)
                    && (this.state.landfall ? point.record_type === "L" : true)
                    && (this.state.only6Hour ?  point.minutes === 0 && point.hours % 6 === 0 : true));
        } else { // Storm
            data = Object.fromEntries(Object.entries(dataSource)
                .filter(([k,storm]) =>
                    (Object.keys(this.state.stormInfo).length === 0 ? true : this.state.stormInfo["id"] === storm["id"])
                    && storm.season >= this.state.minYear
                    && storm.season <= this.state.maxYear
                    && storm.track_points[0].month >= this.state.minMonth
                    && storm.track_points[storm.track_points.length - 1].month <= this.state.maxMonth
                    && storm.max_wind >= this.state.minWind
                    && storm.max_wind <= this.state.maxWind
                    && (this.state.filterByPressure ? storm.min_pressure && storm.min_pressure >= this.state.minPressure : true)
                    && (this.state.filterByPressure ? storm.min_pressure && storm.min_pressure <= this.state.maxPressure : true)
                    && (SYSTEM_STATUSES[this.state.systemStatus] ? storm.status_list.includes(SYSTEM_STATUSES[this.state.systemStatus]) : true)
                    && (this.state.landfall ? storm.record_type_list.includes("L") : true)))
        }
        let layers;
        if (this.state.plotType === PLOT_TYPES.STORM) {
            layers = getStormLayers(data, hoverInfo => this.setState({hoverInfo}), this.onChange,
                this.state.showMaxWindPoly, this.state.showWindPoly);
        } else if (this.state.plotType === PLOT_TYPES.HEATMAP) {
            layers = getHeatmapLayer(data);
        } else if (this.state.plotType === PLOT_TYPES.GRID) {
            layers = getGridLayer(data);
        } else if (this.state.plotType === PLOT_TYPES.MAX_WIND_GRID) {
            layers = getGridLayerMaxWind(data);
        } else {
            // Don't pass anything to stormInfo
            layers = getScatterplotLayer(data, hoverInfo => this.setState({hoverInfo}), stormInfo => {});
        }
        this.setState({
            dataSource,
            data,
            layers
        })
    };

    componentDidMount() {
        // let minW = 999;
        // let maxW = 0;
        // let minP = 9999;
        // let maxP = 0;
        // TRACK_POINTS.forEach(point => {
        //     if (point.wind < minW) {
        //         minW = point.wind
        //     }
        //     if (point.wind > maxW) {
        //         maxW = point.wind
        //     }
        //     if (point.pressure) {
        //         if (point.pressure < minP) {
        //             minP = point.pressure
        //         }
        //         if (point.pressure > maxP) {
        //             maxP = point.pressure
        //         }
        //     }
        // });
        // console.log(minW, maxW, minP, maxP);
        this.onChange({target: {name: PLOT_TYPES.STORM}})
    }

    getToolTip = (object) => {
        if (!object) { return; }
        if (this.state.plotType === "Max Wind Grid") {
            return `Max Wind: ${object.colorValue}`
        }
        if (this.state.plotType === "Grid") {
            return `# of track points: ${object.colorValue}`
        }
    }

    render() {
        return (
            <div style={{width: "100vw", height: "100vh"}}>
                <DeckGL
                    initialViewState={INITIAL_VIEW_STATE}
                    controller={true}
                    layers={this.state.layers}
                    getTooltip={({object}) => this.getToolTip(object)}
                >
                    <Map
                        reuseMaps
                        mapboxAccessToken={MAP_TOKEN}
                        mapStyle="mapbox://styles/mapbox/dark-v9"
                    />

                    {this.state.hoverInfo && this.state.hoverInfo.object && (
                        <div
                            className="tool-tip row"
                            style={{position: 'absolute', zIndex: 1, pointerEvents: 'none', left: this.state.hoverInfo.x, top: this.state.hoverInfo.y}}
                        >
                            <div className="column">
                                <p>Name: {STORMS[this.state.hoverInfo.object["id"]]["name"]}</p>
                                <p>Date: {this.state.hoverInfo.object["date_time"].split(" ")[0]}</p>
                                <p>Longitude: {this.state.hoverInfo.object["longitude"]}</p>
                                <p>Wind: {this.state.hoverInfo.object["wind"]}</p>
                                {this.state.hoverInfo.object["max_wind_radius"] && <p>Max Wind Radius: {this.state.hoverInfo.object["max_wind_radius"]}</p>}
                            </div>
                            <div className="column" style={{paddingLeft: 10}}>
                                <p>Season: {STORMS[this.state.hoverInfo.object["id"]]["season"]}</p>
                                <p>Time: {this.state.hoverInfo.object["date_time"].split(" ")[1]}</p>
                                <p>Latitude: {this.state.hoverInfo.object["latitude"]}</p>
                                <p>Status: {this.state.hoverInfo.object["status"]}</p>
                                {this.state.hoverInfo.object["pressure"] && <p>Pressure: {this.state.hoverInfo.object["pressure"]}</p>}
                            </div>
                        </div>
                    )}
                </DeckGL>
                {this.state.stormInfo && STORMS[this.state.stormInfo["id"]] && (
                    <StormInfo
                        stormInfo={STORMS[this.state.stormInfo["id"]]}
                        exitStormInfo={async (evt) => {
                            await this.setState({stormInfo: {}});
                            this.onChange(evt)
                        }}
                    />)
                }
                <ControlPanel
                    plotType={this.state.plotType}
                    plotTypeOptions={PLOT_TYPES}
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
                    onChange={evt => this.onChange(evt)}
                />
            </div>
        );
    }
}

export default Hurricane;