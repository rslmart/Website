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
    const {stormInfo, selectedPoint, onChange, exitStormInfo} = props;

    function getColorToHex(windSpeed) {
        const color = getColorFromWindSpeed(windSpeed);
        return "#" + ((1 << 24) + (color[0] << 16) + (color[1] << 8) + color[2]).toString(16).slice(1);
    }

    const pointInfo = stormInfo.track_points[selectedPoint];

    return (
        <div className="storm-info">
            <div style={{marginBottom: "20px"}}>
                <h3 style={{float: "left", marginTop: 0, marginBottom: 0}}>{stormInfo["name"]} {stormInfo["season"]}</h3>
                <button onClick={evt => exitStormInfo(evt)} style={{float: "right", }}>&times;</button>
            </div>
            <div>
                <XYPlot
                    xType="time"
                    width={300}
                    height={150}
                    style={{marginBottom: "10px"}}
                >
                    <XAxis title="Time" />
                    <YAxis title="Wind Speed (knots)" />
                    <LineSeries
                        stroke="black"
                        data={stormInfo.track_points.map((point, i) => ({
                            x: new Date(point.date_time).getTime(),
                            y: point.wind,
                        }))}
                    />
                    <MarkSeries
                        fillType="literal"
                        strokeType="literal"
                        data={stormInfo.track_points.map((point, i) => ({
                            x: new Date(point.date_time).getTime(),
                            y: point.wind,
                            fill: getColorToHex(point.wind),
                            opacity: i === selectedPoint ? 1 : 0.75,
                            stroke: i === selectedPoint ? "#000000" : "#FFFFFF"
                        }))}
                        size="4px"
                    />
                </XYPlot>
                {stormInfo.min_pressure &&
                    <XYPlot
                        xType="time"
                        width={300}
                        height={150}
                        colorType="literal"
                    >
                        <YAxis title="Pressure (mb)" />
                        {stormInfo.min_pressure && // For some reason this breaks if you remove the conditions
                            <LineSeries
                                color="#000000"
                                data={stormInfo.track_points.map(point => ({
                                    x: new Date(point.date_time).getTime(),
                                    y: point.pressure ? point.pressure : 1000
                                }))}
                            />
                        }
                        {stormInfo.min_pressure && <MarkSeries
                            colorType="literal"
                            data={[{
                                x: new Date(pointInfo.date_time).getTime(),
                                y: pointInfo.pressure ? pointInfo.pressure : 1000,
                                color: "#000000"
                            }]}
                            size="4px"
                        />
                        }
                    </XYPlot>
                }
            </div>
            <div key={'selectedPoint'} className="input">
                <label>Select Point:</label>
                <input
                    name="selectedPoint"
                    type="range"
                    value={selectedPoint}
                    min={0}
                    max={stormInfo.track_points.length - 1}
                    onChange={evt => onChange(evt)}
                />
            </div>
            <div>Date/Time: {pointInfo.date_time}</div>
            <div>Wind: {pointInfo.wind} Pressure: {pointInfo.pressure}</div>
        </div>
    );
}

export default React.memo(StormInfo);