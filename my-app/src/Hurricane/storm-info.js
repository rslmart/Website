import * as React from 'react';
import {
    LineChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Line,
    Scatter,
    ComposedChart,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { getColorFromWindSpeed } from "./Hurricane";

function StormInfo(props) {
    const { stormInfo, selectedPoint, onChange, exitStormInfo } = props;

    function getColorToHex(windSpeed) {
        const color = getColorFromWindSpeed(windSpeed);
        return "#" + ((1 << 24) + (color[0] << 16) + (color[1] << 8) + color[2]).toString(16).slice(1);
    }

    const pointInfo = stormInfo.track_points[selectedPoint];

    // Prepare chart data
    const chartData = stormInfo.track_points.map((point, i) => ({
        x: new Date(point.date_time).getTime(),
        y: point.wind,
        pressure: point.pressure || 1000,
        fill: getColorToHex(point.wind),
        opacity: i === selectedPoint ? 1 : 0.75,
        stroke: i === selectedPoint ? "#000000" : "#FFFFFF"
    }));

    return (
        <div className="storm-info">
            {/* Header and close button remains the same */}
            <div style={{ marginBottom: "20px" }}>
                <h3 style={{ float: "left", marginTop: 0, marginBottom: 0 }}>{stormInfo["name"]} {stormInfo["season"]}</h3>
                <button onClick={evt => exitStormInfo(evt)} style={{ float: "right" }}>&times;</button>
            </div>

            {/* IR Image remains the same */}
            {pointInfo["ir_image_url"] && (
                <div>
                    <img src={pointInfo["ir_image_url"]} style={{ width: "300px" }} />
                </div>
            )}

            {/* Wind Speed Chart */}
            <div style={{ width: 300, height: 150, marginBottom: 10 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="x"
                            type="number"
                            domain={['auto', 'auto']}
                            tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                        />
                        <YAxis dataKey="y" />
                        <Line
                            type="linear"
                            dataKey="y"
                            stroke="#000"
                            dot={false}
                        />
                        <Scatter
                            data={chartData}
                            fill="#8884d8"
                            shape={({ cx, cy, payload }) => (
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={4}
                                    fill={payload.fill}
                                    stroke={payload.stroke}
                                    opacity={payload.opacity}
                                />
                            )}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Pressure Chart */}
            {stormInfo.min_pressure && (
                <div style={{ width: 300, height: 150 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="x"
                                type="number"
                                domain={['auto', 'auto']}
                                tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                            />
                            <YAxis dataKey="pressure" />
                            <Line
                                type="linear"
                                dataKey="pressure"
                                stroke="#000"
                                dot={false}
                            />
                            <Scatter
                                data={[chartData[selectedPoint]]}
                                fill="#000"
                                shape={<circle r={4} />}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Rest of the component remains the same */}
            <div key={'selectedPoint'} className="input">
                <label>{"Select Point:  "}</label>
                <button name="backwardSelectedPoint" onClick={evt => onChange(evt)}>{"<"}</button>
                <input
                    name="selectedPoint"
                    type="range"
                    value={selectedPoint}
                    min={0}
                    max={stormInfo.track_points.length - 1}
                    onChange={evt => onChange(evt)}
                />
                <button name="forwardSelectedPoint" onClick={evt => onChange(evt)}>{">"}</button>
            </div>
            <div>Date/Time: {pointInfo.date_time}</div>
            <div>Wind: {pointInfo.wind} Pressure: {pointInfo.pressure}</div>
        </div>
    );
}

export default React.memo(StormInfo);