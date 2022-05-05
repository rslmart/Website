import React, {useState} from 'react';
import DeckGL from '@deck.gl/react';
import {LineLayer, ScatterplotLayer} from '@deck.gl/layers';
import {Map} from 'react-map-gl';
import TRACK_POINTS from './track_points.json';
import STORMS from './storms.json';
import ControlPanel from "./control-panel";

/*
Layers
    Trackpoint
        Scatterplot
        Heatmap
        GridLayer/HexagonLayer
            Number of storms (heatmap)
            Max Wind
            Min Pressure
    Storms
        LineLayer
Filters
    Year
    Month
    Wind
    Pressure
    6 hour points
    landfall
    Latitude
        For storms
            max/min
            start/end
    Longitude
    Status (for storms make this a list of all statuses achieved by the storm)
 */

// Set your mapbox access token here
const accessToken = "pk.eyJ1Ijoicm1tYXJ0aW4wMiIsImEiOiJjbDJycXh3Y2gwMnJ5M2psYmh2NnQwM3JwIn0.AQrKQj9udLED80nJYPYy6g";

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

const getLineDataFromStormTrackPoints = (trackpoints) => {
    const line_list = []
    for (let i = 0; i < trackpoints.length - 1; i++) {
        const line = {
            color: getColorFromWindSpeed(trackpoints[i].wind),
            from: [trackpoints[i]["longitude"], trackpoints[i]["latitude"]],
            to: [trackpoints[i + 1]["longitude"], trackpoints[i + 1]["latitude"]],
        }
        line_list.push(line);
    }
    return line_list
};

const getStormLineLayer = (data) => new LineLayer({
    id: 'line-layer',
    data: getLineDataFromStormTrackPoints(Object.values(data).flatMap(storm => storm.track_points)),
    pickable: false,
    getWidth: 1,
    getSourcePosition: d => d.from,
    getTargetPosition: d => d.to,
    getColor: d => d.color
});

export default function Hurricane() {
    const [dataSource, setDataSource] = useState(TRACK_POINTS)
    const [data, setData] = useState(TRACK_POINTS);
    const [min_year, setMinYear] = useState(1851);
    const [max_year, setMaxYear] = useState(2021);
    const [min_wind, setMinWind] = useState(0);
    const [max_wind, setMaxWind] = useState(200);
    const [only_6_hour, setOnly6Hour] = useState(false);
    const [hoverInfo, setHoverInfo] = useState();

    const scatterplot_layer = new ScatterplotLayer({
        id: 'scatterplot-layer',
        getPosition: d => [d.longitude, d.latitude],
        getColor: d => getColorFromWindSpeed(d.wind),
        radiusScale: 6,
        radiusMinPixels: 1,
        radiusMaxPixels: 100,
        data,
        pickable: true,
        onHover: info => setHoverInfo(info)
    });

    const layers = [
        scatterplot_layer
    ];

    const onChange = (evt) => {
        if (evt.target.name === "min_year") {
            setMinYear(evt.target.value)
        }
        if (evt.target.name === "max_year") {
            setMaxYear(evt.target.value)
        }
        if (evt.target.name === "min_wind") {
            setMinWind(evt.target.value)
        }
        if (evt.target.name === "max_wind") {
            setMaxWind(evt.target.value)
        }
        if (evt.target.name === "only_6_hour") {
            setOnly6Hour(evt.target.checked)
        }
        setData(dataSource
            .filter(point => point.year >= min_year)
            .filter(point => point.year <= max_year)
            .filter(point => point.wind >= min_wind)
            .filter(point => point.wind <= max_wind)
            .filter(point => only_6_hour ? false : point.minutes === 0 && point.hours % 6 === 0)
        );
    };

    return (
        <div style={{width: "100vw", height: "100vh"}}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={layers}
            >
                <Map
                    mapboxAccessToken={accessToken}
                    mapStyle="mapbox://styles/mapbox/dark-v9"
                />

                <ControlPanel
                    min_year={min_year}
                    max_year={max_year}
                    min_wind={min_wind}
                    max_wind={max_wind}
                    only_6_hour={only_6_hour}
                    onChange={evt => onChange(evt)}
                />

                {hoverInfo && hoverInfo.object && (
                    <div className="tool-tip row" style={{position: 'absolute', zIndex: 1, pointerEvents: 'none', left: hoverInfo.x, top: hoverInfo.y}}>
                        <div clasName="column">
                            <p>Name: {STORMS[hoverInfo.object["id"]]["name"]}</p>
                            <p>Date: {hoverInfo.object["date_time"].split(" ")[0]}</p>
                            <p>Longitude: {hoverInfo.object["longitude"]}</p>
                            <p>Wind: {hoverInfo.object["wind"]}</p>
                            {hoverInfo.object["max_wind_radius"] && <p>Max Wind Radius: {hoverInfo.object["max_wind_radius"]}</p>}
                        </div>
                        <div clasName="column" style={{paddingLeft: 10}}>
                            <p>Season: {STORMS[hoverInfo.object["id"]]["season"]}</p>
                            <p>Time: {hoverInfo.object["date_time"].split(" ")[1]}</p>
                            <p>Latitude: {hoverInfo.object["latitude"]}</p>
                            <p>Status: {hoverInfo.object["status"]}</p>
                            {hoverInfo.object["pressure"] && <p>Pressure: {hoverInfo.object["pressure"]}</p>}
                        </div>
                    </div>
                )}
            </DeckGL>
        </div>
    );
}