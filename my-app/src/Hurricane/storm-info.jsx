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
import { formatKnots, formatMillibars } from "./trackSemantics";

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

export function buildRammbUrls(stormInfo, pointInfo) {
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

export function buildIrCandidateUrls(stormInfo, pointInfo) {
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
    backgroundColor: 'var(--color-surface)',
    boxShadow: 'var(--shadow-panel)',
    borderRadius: 'var(--radius)',
    padding: '6px 12px',
    margin: '20px',
    fontSize: '13px',
    lineHeight: 2,
    color: 'var(--color-text-muted)',
    outline: 'none',
    zIndex: 9999,
};

const tapButton = {
    minWidth: 44,
    minHeight: 44,
    padding: 0,
    fontSize: 18,
    lineHeight: 1,
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    cursor: "pointer",
};

const imageryFrame = {
    width: "100%",
    maxWidth: 300,
    minHeight: 72,
    margin: "8px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: 16,
    textAlign: "center",
    padding: "8px 12px",
};

function SatelliteImage({ stormInfo, pointInfo }) {
    const irKey = `${stormInfo["id"]}|${pointInfo.date_time}`;
    // Reset during render so a new point does not keep the previous point's
    // attempt. An error from the image we just unmounted must not advance it.
    const [frame, setFrame] = React.useState({ key: irKey, attempt: 0, ready: false });
    if (frame.key !== irKey) {
        setFrame({ key: irKey, attempt: 0, ready: false });
    }
    const showing = frame.key === irKey ? frame : { key: irKey, attempt: 0, ready: false };

    const candidates = buildIrCandidateUrls(stormInfo, pointInfo);
    const season = stormInfo.season || 0;
    const source = season >= 2016 ? "Enhanced IR — RAMMB/CIRA" : "Infrared — HURSAT-B1 (NOAA NCEI)";
    const url = showing.attempt < candidates.length ? candidates[showing.attempt] : null;

    if (!url) {
        return (
            <div role="status" style={imageryFrame}>No imagery</div>
        );
    }

    return (
        <div aria-busy={!showing.ready} style={{ maxWidth: 300 }}>
            {!showing.ready && (
                <div role="status" style={imageryFrame}>Loading imagery…</div>
            )}
            <img
                key={url}
                src={url}
                alt={`Infrared satellite image of ${stormInfo["name"]} near ${pointInfo.date_time}`}
                aria-hidden={showing.ready ? undefined : true}
                style={{ width: "100%", maxWidth: 300, display: showing.ready ? "block" : "none" }}
                onLoad={() => setFrame(current => current.key === irKey ? { ...current, ready: true } : current)}
                onError={() => setFrame(current => (
                    current.key === irKey
                        ? { key: irKey, attempt: current.attempt + 1, ready: false }
                        : current
                ))}
            />
            {showing.ready && <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{source}</div>}
        </div>
    );
}

function StormInfo(props) {
    const { stormInfo, selectedPoint, onChange, exitStormInfo, embedded, collapsed, onToggleCollapsed } = props;

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

    const title = (
        <h3 style={{
            float: embedded ? "none" : "left",
            flex: embedded ? 1 : undefined,
            marginTop: 0,
            marginBottom: 0,
            color: "var(--color-text)",
            fontSize: embedded ? 16 : undefined,
        }}>
            {stormInfo["name"]} {stormInfo["season"]}
            {stormInfo.provisional ? " · Provisional" : ""}
        </h3>
    );

    const body = (
        <>
            <SatelliteImage stormInfo={stormInfo} pointInfo={pointInfo} />

            <div style={{ width: embedded ? "100%" : 300, maxWidth: 300, height: embedded ? 200 : 300 }}>
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
                            domain={[0, dataMax => {
                                const peak = Number.isFinite(dataMax) ? dataMax : 0;
                                return Math.max(10, Math.ceil(peak * 1.1 / 10) * 10);
                            }]}
                            allowDecimals={false}
                            label={{ value: 'Wind (kt)', angle: -90 }}
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
                                        stroke="none"
                                        // Selection ring in the text colour, so it shows on both themes' panels.
                                        style={index === selectedPoint ? { stroke: 'var(--color-text)' } : undefined}
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
                                <div
                                    className="custom-tooltip"
                                    style={{
                                        backgroundColor: "var(--color-surface)",
                                        border: "1px solid var(--color-border-strong)",
                                        borderRadius: "var(--radius-sm)",
                                        padding: "0 8px",
                                    }}
                                >
                                    {/* Text in the theme colour; the series colour stays on the swatch. */}
                                    {payload?.map((entry, index) => (
                                        <p key={index} style={{ color: 'var(--color-text)' }}>
                                            <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, marginRight: 6, borderRadius: 2, background: entry.color }} />
                                            {entry.name}: {Math.round(entry.value)}{entry.name === 'Wind Speed' ? ' kt' : ' mb'}
                                        </p>
                                    ))}
                                </div>
                            )}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div key={'selectedPoint'} className="input" style={embedded ? { display: "flex", alignItems: "center", gap: 8 } : undefined}>
                <label>{"Select Point:  "}</label>
                <button
                    type="button"
                    name="backwardSelectedPoint"
                    onClick={evt => onChange(evt)}
                    aria-label="Previous track point"
                    style={embedded ? tapButton : undefined}
                >{"<"}</button>
                <input
                    name="selectedPoint"
                    type="range"
                    value={selectedPoint}
                    min={0}
                    max={stormInfo.track_points.length - 1}
                    onChange={evt => onChange(evt)}
                    style={embedded ? { flex: "1 1 auto", minHeight: 44, minWidth: 44 } : undefined}
                />
                <button
                    type="button"
                    name="forwardSelectedPoint"
                    onClick={evt => onChange(evt)}
                    aria-label="Next track point"
                    style={embedded ? tapButton : undefined}
                >{">"}</button>
            </div>
            <div>Date/Time: {pointInfo.date_time}</div>
            <div>Wind: {formatKnots(pointInfo.wind)} Pressure: {formatMillibars(pointInfo.pressure)}</div>
        </>
    );

    if (embedded) {
        return (
            <div style={{ color: "var(--color-text-muted)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                    {title}
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? "Expand storm details" : "Collapse storm details"}
                        style={tapButton}
                    >
                        {collapsed ? "+" : "−"}
                    </button>
                    <button type="button" onClick={evt => exitStormInfo(evt)} aria-label="Close storm details" style={tapButton}>
                        &times;
                    </button>
                </div>
                {!collapsed && body}
            </div>
        );
    }

    return (
        <div style={stormInfoStyles}>
            <div style={{ marginBottom: "20px" }}>
                {title}
                <button type="button" onClick={evt => exitStormInfo(evt)} style={{ float: "right" }} aria-label="Close storm details">&times;</button>
            </div>
            {body}
        </div>
    );
}

export default React.memo(StormInfo);