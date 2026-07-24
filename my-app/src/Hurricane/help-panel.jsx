import * as React from 'react';
import HelpModal, { helpSectionTitle as sectionTitle, helpList as list, helpListItem as li } from '../components/HelpModal';

const WIND_LEGEND = [
    { color: "rgb(94,186,255)", label: "< 34 kt (TD)" },
    { color: "rgb(0,250,244)", label: "34–63 kt (TS)" },
    { color: "rgb(255,247,149)", label: "64–82 kt (Cat 1)" },
    { color: "rgb(255,216,33)", label: "83–95 kt (Cat 2)" },
    { color: "rgb(255,143,32)", label: "96–112 kt (Cat 3)" },
    { color: "rgb(255,96,96)", label: "113–136 kt (Cat 4)" },
    { color: "rgb(196,100,217)", label: "≥ 137 kt (Cat 5)" },
];

function HelpPanel({ open, onOpen, onClose, fabPosition = { top: 20, left: 70 } }) {
    return (
        <HelpModal
            open={open}
            onOpen={onOpen}
            onClose={onClose}
            title="Hurricane Explorer — Guide"
            fabPosition={fabPosition}
            fabTitle="How to use this map"
        >
            <p style={{ marginTop: 8, color: "var(--color-text-muted)" }}>
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
        </HelpModal>
    );
}

export default React.memo(HelpPanel);
