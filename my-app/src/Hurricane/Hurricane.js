import React, {Component} from 'react';
import DeckGL from '@deck.gl/react';
import {GridLayer, HeatmapLayer} from '@deck.gl/aggregation-layers';
import {LineLayer, ScatterplotLayer} from '@deck.gl/layers';
import {Map} from 'react-map-gl';
import TRACK_POINTS from './track_points.json';
import STORMS from './storms.json';
import ControlPanel from "./control-panel";

/*
/Layers
    Trackpoint
        /Scatterplot
        //Heatmap
        //GridLayer/HexagonLayer
            Number of storms (heatmap)
            Max Wind
            Min Pressure
    /Storms
        LineLayer
Filters
    /Year
    Month
    /Wind
    Pressure - when enabled filter out all points wihtout pressure
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

// Set your mapbox access token here
const accessToken = "pk.eyJ1Ijoicm1tYXJ0aW4wMiIsImEiOiJjbDJycXh3Y2gwMnJ5M2psYmh2NnQwM3JwIn0.AQrKQj9udLED80nJYPYy6g";

const PLOT_TYPES = {
    STORM: "Storm",
    SCATTER_PLOT: "Scatter Plot",
    HEATMAP: "Heatmap",
    GRID: "Grid"
}

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
}

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
                from: [trackpoints[i]["longitude"], trackpoints[i]["latitude"]],
                to: [trackpoints[i + 1]["longitude"], trackpoints[i + 1]["latitude"]],
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

const getScatterplotLayer = (track_points, setHoverInfo) => new ScatterplotLayer({
    id: 'scatterplot-layer',
    getPosition: d => [d.longitude, d.latitude],
    getColor: d => getColorFromWindSpeed(d.wind),
    radiusScale: 6,
    radiusMinPixels: 2,
    radiusMaxPixels: 50,
    data: track_points,
    pickable: true,
    onHover: info => setHoverInfo(info)
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
    colorRange: [[255,255,178,128],[254,217,118,128],[254,178,76,128],[253,141,60,128],[240,59,32,128],[189,0,38,128]],
    getPosition: d => [d.longitude, d.latitude],
});

const getStormLayers = (storms, setHoverInfo) => [
    getStormLineLayer(storms),
    getScatterplotLayer(Object.values(storms).flatMap(storm => storm["track_points"]), setHoverInfo)
]

class Hurricane extends Component {
    state = {
        plotType: PLOT_TYPES.STORM,
        dataSource: STORMS,
        data: STORMS,
        minYear: 1851,
        maxYear: 2021,
        minWind: 0,
        maxWind: 200,
        systemStatus: SYSTEM_STATUSES.None,
        landfall: false,
        only6Hour: false,
        hoverInfo: {},
        layers: getStormLayers(STORMS, hoverInfo => this.setState({hoverInfo}))
    }

    onChange = async (evt) => {
        if (evt.target.name === "minYear") {
            await this.setState({ minYear: evt.target.value });
        }
        else if (evt.target.name === "maxYear") {
            await this.setState({ maxYear: evt.target.value });
        }
        else if (evt.target.name === "minWind") {
            await this.setState({ minWind: evt.target.value });
        }
        else if (evt.target.name === "maxWind") {
            await this.setState({ maxWind: evt.target.value });
        }
        else if (evt.target.name === "systemStatus") {
            await this.setState({ systemStatus: evt.target.value });
        }
        else if (evt.target.name === "landfall") {
            await this.setState({ landfall: evt.target.checked });
        }
        else if (evt.target.name === "only6Hour") {
            await this.setState({ only6Hour: evt.target.checked });
        }
        else if (evt.target.name === "plotType") {
            await this.setState({ plotType: evt.target.value });
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
        }
        let data;
        if (Array.isArray(dataSource)) {
            console.log(this.state.only6Hour);
            data = dataSource
                .filter(point => point.year >= this.state.minYear)
                .filter(point => point.year <= this.state.maxYear)
                .filter(point => point.wind >= this.state.minWind)
                .filter(point => point.wind <= this.state.maxWind)
                .filter(point => SYSTEM_STATUSES[this.state.systemStatus] ? point.status === SYSTEM_STATUSES[this.state.systemStatus] : true)
                .filter(point => this.state.landfall ? point.record_type === "L" : true)
                .filter(point => this.state.only6Hour ?  point.minutes === 0 && point.hours % 6 === 0 : true);
        } else {
            data = Object.fromEntries(Object.entries(dataSource)
                .filter(([k,storm]) => storm.season >= this.state.minYear)
                .filter(([k,storm]) => storm.season <= this.state.maxYear)
                .filter(([k,storm]) => storm.max_wind >= this.state.minWind)
                .filter(([k,storm]) => storm.max_wind <= this.state.maxWind)
                .filter(([k,storm]) => SYSTEM_STATUSES[this.state.systemStatus] ? storm.status_list.includes(SYSTEM_STATUSES[this.state.systemStatus]) : true)
                .filter(([k,storm]) => this.state.landfall ? storm.record_type_list.includes("L") : true));
        }
        let layers;
        if (this.state.plotType === PLOT_TYPES.STORM) {
            layers = getStormLayers(data, hoverInfo => this.setState({hoverInfo}));
        } else if (this.state.plotType === PLOT_TYPES.HEATMAP) {
            layers = getHeatmapLayer(data);
        } else if (this.state.plotType === PLOT_TYPES.GRID) {
            layers = getGridLayer(data);
        } else {
            layers = getScatterplotLayer(data, hoverInfo => this.setState({hoverInfo}));
        }
        this.setState({
            dataSource,
            data,
            layers
        })
    };

    render() {
        return (
            <div style={{width: "100vw", height: "100vh"}}>
                <DeckGL
                    initialViewState={INITIAL_VIEW_STATE}
                    controller={true}
                    layers={this.state.layers}
                >
                    <Map
                        mapboxAccessToken={accessToken}
                        mapStyle="mapbox://styles/mapbox/dark-v9"
                    />

                    <ControlPanel
                        plotType={this.state.plotType}
                        plotTypeOptions={PLOT_TYPES}
                        systemStatus={this.state.systemStatus}
                        systemStatusOptions={SYSTEM_STATUSES}
                        minYear={this.state.minYear}
                        maxYear={this.state.maxYear}
                        minWind={this.state.minWind}
                        maxWind={this.state.maxWind}
                        landfall={this.state.landfall}
                        only6Hour={this.state.only6Hour}
                        onChange={evt => this.onChange(evt)}
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
            </div>
        );
    }
}

export default Hurricane;