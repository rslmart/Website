import * as React from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';
import { getColorFromWindSpeed } from "./Hurricane";

const stormInfoStyles = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    maxWidth: '320px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    padding: '6px 12px',
    margin: '20px',
    fontSize: '13px',
    lineHeight: 2,
    color: '#6b6b76',
    outline: 'none',
    zIndex: 9999,
};

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

    // Calculate min/max values separately
    const pressureValues = chartData.map(d => d.pressure).filter(Boolean);
    const hasPressureData = pressureValues.length > 0;

    return (
        <div style={stormInfoStyles}>
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

            <div style={{ width: 300, height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="x"
                            tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                        />

                        {/* Wind Speed Axis */}
                        <YAxis
                            yAxisId="left"
                            domain={[0, dataMax => Math.ceil(dataMax * 1.1 / 10) * 10]}
                            allowDecimals={false}
                            label={{ value: 'Wind Speed (kts)', angle: -90 }}
                        />

                        {/* Pressure Axis */}
                        {hasPressureData && (
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                domain={[dataMin => Math.floor(dataMin * 0.98), dataMax => Math.ceil(dataMax * 1.02)]}
                                allowDecimals={false}
                                label={{ value: 'Pressure (mb)', angle: 90 }}
                            />
                        )}

                        {/* Wind Speed Line with Custom Colored Dots */}
                        <Line
                            yAxisId="left"
                            dataKey="y"
                            stroke="#8884d8"
                            dot={({ index, payload, ...props }) => (
                                <circle
                                    {...props}
                                    r={index === selectedPoint ? 6 : 4}
                                    fill={payload.fill}
                                    stroke={index === selectedPoint ? '#ff0000' : 'none'}
                                    strokeWidth={2}
                                    opacity={index === selectedPoint ? 1 : 0.8}
                                />
                            )}
                            name="Wind Speed"
                        />

                        {/* Pressure Line with Conditional Dots */}
                        {hasPressureData && (
                            <Line
                                yAxisId="right"
                                dataKey="pressure"
                                stroke="#ff7300"
                                dot={({ index, payload, ...props }) => payload.pressure && (
                                    <circle
                                        {...props}
                                        r={index === selectedPoint ? 6 : 4}
                                        fill={payload.fill}
                                        stroke={index === selectedPoint ? '#000' : 'none'}
                                        strokeWidth={1}
                                        opacity={index === selectedPoint ? 1 : 0.8}
                                    />
                                )}
                                name="Pressure"
                            />
                        )}

                        <Legend />
                        <Tooltip
                            content={({ payload }) => (
                                <div className="custom-tooltip">
                                    {payload?.map((entry, index) => (
                                        <p key={index} style={{ color: entry.color }}>
                                            {entry.name}: {Math.round(entry.value)}{entry.name === 'Wind Speed' ? ' kts' : ' mb'}
                                        </p>
                                    ))}
                                </div>
                            )}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

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