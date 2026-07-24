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

const pad = (n) => String(n).padStart(2, "0");

function parsePointUTC(dateTime) {
    const [date, time] = dateTime.split(" ");
    const [year, month, day] = date.split("-").map(Number);
    const hour = parseInt(time.slice(0, 2), 10);
    const minute = parseInt(time.slice(3, 5), 10) || 0;
    return Date.UTC(year, month - 1, day, hour, minute, 0);
}

function stamp(ms) {
    const t = new Date(ms);
    return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}`;
}

// RAMMB/CIRA TC Real-Time serves enhanced-IR frames on ~10-15 min cadence, indexed
// by scan time (not synoptic hour). For a given track point we try the exact hour
// first, then progressively wider offsets before/after, so a missing frame falls back
// to the nearest available image instead of disappearing. Coverage is reliable from
// the 2016 season onward.
const RAMMB_MINUTE_OFFSETS = [0, 10, -10, 15, -15, 20, -20, 30, -30, 45, -45, 60, -60, 90, -90, 120, -120];

function buildRammbUrls(stormInfo, pointInfo) {
    const atcf = stormInfo && stormInfo.atcf_id;
    if (!atcf || atcf.length < 8) return [];
    const stormId = `${atcf.slice(4, 8)}${atcf.slice(0, 2).toLowerCase()}${atcf.slice(2, 4)}`;
    const base = parsePointUTC(pointInfo.date_time);
    // RAMMB indexes by scan time, so re-anchor on the exact synoptic hour.
    const baseHour = base - (base % (60 * 60 * 1000));
    return RAMMB_MINUTE_OFFSETS.map(
        (offset) =>
            `https://rammb-data.cira.colostate.edu/tc_realtime/products/storms/${stormId}/4kmirimg/${stormId}_4kmirimg_${stamp(baseHour + offset * 60000)}.gif`
    );
}

// HURSAT-B1 frames we pre-rendered to S3 (served via CloudFront at makoa.link) for
// notable 1978-2015 storms. Frames are 3-hourly on synoptic times, so we snap the
// track point to the nearest 3h boundary and search outward, giving the same
// nearest-available fallback as RAMMB. Absolute URL so it works in dev and prod.
const HURSAT_BASE = "https://makoa.link/hurricane-ir";
const THREE_HOURS = 3 * 60 * 60 * 1000;
const HURSAT_STEP_OFFSETS = [0, -1, 1, -2, 2, -3, 3, -4, 4];

function buildHursatUrls(stormInfo, pointInfo) {
    const sid = stormInfo && stormInfo.id;
    if (!sid) return [];
    const base = parsePointUTC(pointInfo.date_time);
    const synoptic = Math.round(base / THREE_HOURS) * THREE_HOURS;
    return HURSAT_STEP_OFFSETS.map(
        (k) => `${HURSAT_BASE}/${sid}/${stamp(synoptic + k * THREE_HOURS)}.jpg`
    );
}

function buildIrCandidateUrls(stormInfo, pointInfo) {
    const season = stormInfo.season || 0;
    if (season >= 2016) return buildRammbUrls(stormInfo, pointInfo);
    if (season >= 1978) return buildHursatUrls(stormInfo, pointInfo);
    return [];
}

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
    const { stormInfo, selectedPoint, onChange, exitStormInfo, embedded } = props;

    function getColorToHex(windSpeed) {
        const color = getColorFromWindSpeed(windSpeed);
        return "#" + ((1 << 24) + (color[0] << 16) + (color[1] << 8) + color[2]).toString(16).slice(1);
    }

    const pointInfo = stormInfo.track_points[selectedPoint];
    const irCandidates = buildIrCandidateUrls(stormInfo, pointInfo);
    const irSource = (stormInfo.season || 0) >= 2016 ? "Enhanced IR — RAMMB/CIRA" : "Infrared — HURSAT-B1 (NOAA NCEI)";
    // Reset to the exact-hour candidate whenever the selected point (or storm) changes.
    const irKey = `${stormInfo["id"]}|${pointInfo.date_time}`;
    const [irIndex, setIrIndex] = React.useState(0);
    React.useEffect(() => { setIrIndex(0); }, [irKey]);
    const irImageUrl = irIndex < irCandidates.length ? irCandidates[irIndex] : null;

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
        <div style={embedded ? { color: '#6b6b76' } : stormInfoStyles}>
            {/* Header and close button remains the same */}
            <div style={{ marginBottom: "20px" }}>
                <h3 style={{ float: "left", marginTop: 0, marginBottom: 0 }}>{stormInfo["name"]} {stormInfo["season"]}</h3>
                <button onClick={evt => exitStormInfo(evt)} style={{ float: "right" }}>&times;</button>
            </div>

            {/* IR imagery: HURSAT-B1 (1978-2015, pre-rendered to S3) or RAMMB/CIRA (2016+).
                Falls back to the nearest available frame before/after; hidden only if none load. */}
            {irImageUrl && (
                <div>
                    <img
                        src={irImageUrl}
                        alt={`Infrared satellite image of ${stormInfo["name"]} near ${pointInfo.date_time}`}
                        style={{ width: "300px", display: "block" }}
                        onError={() => setIrIndex((i) => i + 1)}
                    />
                    <div style={{ fontSize: 11, color: "#9b9ba6" }}>{irSource}</div>
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