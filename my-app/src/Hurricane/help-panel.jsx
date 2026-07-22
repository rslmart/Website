import * as React from 'react';

const WIND_LEGEND = [
    { color: "rgb(94,186,255)", label: "< 34 kt (TD)" },
    { color: "rgb(0,250,244)", label: "34–63 kt (TS)" },
    { color: "rgb(255,247,149)", label: "64–82 kt (Cat 1)" },
    { color: "rgb(255,216,33)", label: "83–95 kt (Cat 2)" },
    { color: "rgb(255,143,32)", label: "96–112 kt (Cat 3)" },
    { color: "rgb(255,96,96)", label: "113–136 kt (Cat 4)" },
    { color: "rgb(196,100,217)", label: "≥ 137 kt (Cat 5)" },
];

const sectionTitle = { margin: "16px 0 6px", fontSize: 15, color: "#2f2f3a" };
const list = { margin: "0 0 0 2px", paddingLeft: 18 };
const li = { marginBottom: 4 };

function HelpPanel({ open, onOpen, onClose }) {
    React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) {
        return (
            <button
                onClick={onOpen}
                aria-label="Open help"
                title="How to use this map"
                style={{
                    position: "absolute",
                    top: 20,
                    left: 20,
                    zIndex: 9999,
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    color: "#4a7fd6",
                    fontSize: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                }}
            >
                ?
            </button>
        );
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.55)",
                zIndex: 10000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: "#fff",
                    color: "#4a4a55",
                    maxWidth: 640,
                    width: "100%",
                    maxHeight: "85vh",
                    overflowY: "auto",
                    borderRadius: 8,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
                    padding: "20px 26px 26px",
                    fontSize: 13,
                    lineHeight: 1.55,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 20, color: "#2f2f3a" }}>Hurricane Explorer — Guide</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close help"
                        style={{ border: "none", background: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "#6b6b76" }}
                    >
                        &times;
                    </button>
                </div>
                <p style={{ marginTop: 8, color: "#6b6b76" }}>
                    Explore every tropical cyclone on record (IBTrACS, 1842–present) with track data and
                    infrared satellite imagery. Pan and zoom the map like any web map; scroll or pinch to zoom.
                </p>

                <h3 style={sectionTitle}>Display modes</h3>
                <p style={{ margin: "0 0 6px" }}>Set with <em>Mode</em> in the filter panel (top-right):</p>
                <ul style={list}>
                    <li style={li}><strong>Storm</strong> — draws full storm tracks as lines. Click a track to open its detail panel.</li>
                    <li style={li}><strong>Scatter Plot</strong> — every individual 6-hourly track point as a dot.</li>
                    <li style={li}><strong>Heatmap</strong> — density of track points.</li>
                    <li style={li}><strong>Grid</strong> — 3D bars counting track points per cell.</li>
                    <li style={li}><strong>Max Wind Grid</strong> — 3D bars showing the strongest wind recorded in each cell.</li>
                </ul>

                <h3 style={sectionTitle}>Filters (top-right panel, toggle with + / −)</h3>
                <ul style={list}>
                    <li style={li}><strong>Basin</strong> — limit to one of the seven ocean basins, or All.</li>
                    <li style={li}><strong>Name</strong> (Storm mode) — type to filter by storm name, e.g. <em>KATRINA</em>.</li>
                    <li style={li}><strong>Min / Max Year</strong> and <strong>Min / Max Month</strong> — restrict the time window.</li>
                    <li style={li}><strong>Min / Max Wind</strong> — keep only points within a wind-speed range (knots).</li>
                    <li style={li}><strong>Filter by Pressure</strong> — enable, then set a Min / Max central-pressure range (mb). Points without pressure are dropped.</li>
                    <li style={li}><strong>System Status</strong> — keep storms that reached a given classification (Hurricane, Tropical Storm, Extra-Tropical, …).</li>
                    <li style={li}><strong>Show Max Wind Radii</strong> / <strong>Show 34/50/64 kt Wind Radii</strong> (Storm mode) — overlay wind-field polygons.</li>
                    <li style={li}><strong>Only 6 Hour Points</strong> (Scatter mode) — drop interpolated in-between fixes.</li>
                </ul>

                <h3 style={sectionTitle}>Storm detail (click a track in Storm mode)</h3>
                <ul style={list}>
                    <li style={li}>Opens a panel (bottom-left) with the storm name, season, and a wind &amp; pressure chart over its lifetime.</li>
                    <li style={li}><strong>Infrared satellite image</strong> for the selected point — HURSAT-B1 for 1978–2015, RAMMB/CIRA for 2016+. If an exact frame is missing, the nearest one before/after is shown.</li>
                    <li style={li}>Use the <strong>Select Point</strong> slider or the <strong>&lt;</strong> / <strong>&gt;</strong> buttons to step through the storm; the image and highlighted chart point update.</li>
                    <li style={li}>Close it with the <strong>×</strong> in its corner.</li>
                </ul>

                <h3 style={sectionTitle}>Other controls</h3>
                <ul style={list}>
                    <li style={li}><strong>Hover</strong> any point or track for a tooltip (name, date/time, position, wind, pressure, status).</li>
                    <li style={li}><strong>Settings</strong> (bottom-right, + / −) — fine-tune the current layer's rendering (dot sizes, line widths, grid cell size, heatmap radius/intensity).</li>
                    <li style={li}><strong>Data &amp; imagery sources</strong> (bottom-right) — attribution and links to the underlying datasets.</li>
                </ul>

                <h3 style={sectionTitle}>Color scale (by wind speed)</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                    {WIND_LEGEND.map((entry) => (
                        <div key={entry.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: entry.color, display: "inline-block" }} />
                            <span>{entry.label}</span>
                        </div>
                    ))}
                </div>

                <div style={{ textAlign: "right", marginTop: 20 }}>
                    <button
                        onClick={onClose}
                        style={{
                            border: "none",
                            backgroundColor: "#4a7fd6",
                            color: "#fff",
                            padding: "8px 18px",
                            borderRadius: 4,
                            fontSize: 14,
                            cursor: "pointer",
                        }}
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}

export default React.memo(HelpPanel);
