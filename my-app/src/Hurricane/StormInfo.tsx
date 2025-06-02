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
    Legend,
    TooltipProps
} from 'recharts';
import { getColorFromWindSpeed } from "./Hurricane";

interface TrackPoint {
    date_time: string;
    wind: number;
    pressure?: number;
    ir_image_url?: string;
    [key: string]: any;
}

interface StormInfo {
    name: string;
    season: number;
    track_points: TrackPoint[];
}

interface StormInfoProps {
    stormInfo: StormInfo;
    selectedPoint: number;
    onChange: (event: React.ChangeEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement>) => void;
    exitStormInfo: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

interface ChartDataPoint {
    x: number;
    y: number;
    pressure: number;
    fill: string;
    opacity: number;
    stroke: string;
}

const stormInfoStyles: React.CSSProperties = {
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

const StormInfo: React.FC<StormInfoProps> = ({ stormInfo, selectedPoint, onChange, exitStormInfo }) => {
    function getColorToHex(windSpeed: number): string {
        const color = getColorFromWindSpeed(windSpeed);
        return "#" + ((1 << 24) + (color[0] << 16) + (color[1] << 8) + color[2]).toString(16).slice(1);
    }

    const pointInfo = stormInfo.track_points[selectedPoint];

    // Prepare chart data
    const chartData: ChartDataPoint[] = stormInfo.track_points.map((point, i) => ({
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

    const CustomTooltip = ({ payload }: TooltipProps<number, string>) => {
        if (!payload || payload.length === 0) return null;

        return (
            <div className="custom-tooltip" style={{ backgroundColor: '#fff', padding: '5px', border: '1px solid #ccc' }}>
                {payload.map((entry, index) => (
                    <p key={index} style={{ color: entry.color }}>
                        {entry.name}: {Math.round(entry.value as number)}{entry.name === 'Wind Speed' ? ' kts' : ' mb'}
                    </p>
                ))}
            </div>
        );
    };

    return (
        <div style={stormInfoStyles}>
            <div style={{ marginBottom: "20px" }}>
                <h3 style={{ float: "left", marginTop: 0, marginBottom: 0 }}>{stormInfo.name} {stormInfo.season}</h3>
                <button onClick={exitStormInfo} style={{ float: "right" }}>&times;</button>
            </div>

            {pointInfo.ir_image_url && (
                <div>
                    <img src={pointInfo.ir_image_url} alt="Infrared satellite" style={{ width: "300px" }} />
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

                        <YAxis
                            yAxisId="left"
                            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1 / 10) * 10]}
                            allowDecimals={false}
                            label={{ value: 'Wind Speed (kts)', angle: -90 }}
                        />

                        {hasPressureData && (
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                domain={[(dataMin: number) => Math.floor(dataMin * 0.98), (dataMax: number) => Math.ceil(dataMax * 1.02)]}
                                allowDecimals={false}
                                label={{ value: 'Pressure (mb)', angle: 90 }}
                            />
                        )}

                        <Line
                            yAxisId="left"
                            dataKey="y"
                            stroke="#8884d8"
                            dot={({ index, payload, ...props }) => (
                                <circle
                                    {...props}
                                    r={index === selectedPoint ? 6 : 4}
                                    fill={(payload as ChartDataPoint).fill}
                                    stroke={index === selectedPoint ? '#ff0000' : 'none'}
                                    strokeWidth={2}
                                    opacity={index === selectedPoint ? 1 : 0.8}
                                />
                            )}
                            name="Wind Speed"
                        />

                        {hasPressureData && (
                            <Line
                                yAxisId="right"
                                dataKey="pressure"
                                stroke="#ff7300"
                                dot={({ index, payload, ...props }) => (
                                    <circle
                                        {...props}
                                        r={index === selectedPoint ? 6 : 4}
                                        fill={(payload as ChartDataPoint).fill}
                                        stroke={index === selectedPoint ? '#000' : 'none'}
                                        strokeWidth={1}
                                        opacity={index === selectedPoint ? 1 : 0.8}
                                    />
                                )}
                                name="Pressure"
                            />
                        )}

                        <Legend />
                        <Tooltip content={<CustomTooltip />} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div key={'selectedPoint'} className="input">
                <label>{"Select Point:  "}</label>
                <button name="backwardSelectedPoint" onClick={onChange}>{"<"}</button>
                <input
                    name="selectedPoint"
                    type="range"
                    value={selectedPoint}
                    min={0}
                    max={stormInfo.track_points.length - 1}
                    onChange={onChange}
                />
                <button name="forwardSelectedPoint" onClick={onChange}>{">"}</button>
            </div>
            <div>Date/Time: {pointInfo.date_time}</div>
            <div>Wind: {pointInfo.wind} {pointInfo.pressure && `Pressure: ${pointInfo.pressure}`}</div>
        </div>
    );
};

export default React.memo(StormInfo);