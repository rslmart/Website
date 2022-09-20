import * as React from 'react';
import {
    XYPlot,
    XAxis,
    YAxis,
    HorizontalGridLines,
    VerticalGridLines,
    LineSeries,
    MarkSeries
} from 'react-vis';
import {getColorFromWindSpeed} from "./Hurricane";

function StormInfo(props) {
    const {stormInfo, onChange, exitStormInfo} = props;

    function getColorToHex(windSpeed) {
        const color = getColorFromWindSpeed(windSpeed);
        return "#" + ((1 << 24) + (color[0] << 16) + (color[1] << 8) + color[2]).toString(16).slice(1);
    }

    return (
        <div className="storm-info">
            <div style={{marginBottom: "20px"}}>
                <h3 style={{float: "left", marginTop: 0, marginBottom: 0}}>{stormInfo["name"]} {stormInfo["season"]}</h3>
                <button onClick={evt => exitStormInfo(evt)} style={{float: "right", }}>&times;</button>
            </div>
            <div>
                <XYPlot xType="time" width={300} height={150} colorType="literal" style={{marginBottom: "10px"}}>
                    <XAxis title="Time" />
                    <YAxis title="Wind Speed (knots)" />
                    <LineSeries
                        data={stormInfo.track_points.map((point, i) => ({x: new Date(point.date_time).getTime(), y: point.wind}))}
                    />
                    <MarkSeries
                        data={stormInfo.track_points.map((point, i) => ({
                            x: new Date(point.date_time).getTime(),
                            y: point.wind,
                            color: getColorToHex(point.wind)
                        }))}
                        size="4px"
                    />
                </XYPlot>
                {stormInfo.min_pressure && <XYPlot xType="time" width={300} height={150}>
                    <YAxis title="Pressure (mb)" />
                    {stormInfo.min_pressure && <LineSeries
                        data={stormInfo.track_points.map(point => ({x: new Date(point.date_time).getTime(), y: point.pressure}))}
                    />}

                </XYPlot>}
            </div>
            <div key={'selectedPoint'} className="input">
                <label>Select Point:</label>
                <input
                    name="selectedPoint"
                    type="range"
                    value={1}
                    min={0}
                    max={stormInfo.track_points.length - 1}
                    onChange={evt => onChange(evt)}
                />
            </div>
        </div>
    );
}

export default React.memo(StormInfo);