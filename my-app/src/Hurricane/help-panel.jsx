import * as React from 'react';
import HelpModal, { helpSectionTitle as sectionTitle, helpList as list, helpListItem as li } from '../components/HelpModal';
import { MISSING_WIND_COLOR, MISSING_WIND_LABEL, WIND_CATEGORIES } from './trackSemantics';

const scaleRow = { display: "flex", alignItems: "center", gap: 6 };

function swatch(color) {
    return {
        width: 14,
        height: 14,
        borderRadius: 3,
        backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
        border: "1px solid var(--color-border-strong)",
        display: "inline-block",
        boxSizing: "border-box",
    };
}

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
                Explore every tropical cyclone in the IBTrACS record with track data and
                infrared satellite imagery. Pan and zoom the map like any web map; scroll or pinch to zoom.
            </p>

            <h3 style={sectionTitle}>Display modes</h3>
            <p style={{ margin: "0 0 6px" }}>
                Set with <em>Mode</em>. On a wide screen it is in the filter panel (top-right).
                On a phone it is in the Controls drawer (bottom-right).
            </p>
            <ul style={list}>
                <li style={li}><strong>Storm</strong> — draws each track as a line with a point at every fix. Click a point to open that storm. The line itself is not clickable.</li>
                <li style={li}><strong>Scatter Plot</strong> — one dot per track point, including fixes between the 6-hour times. Hover a dot for its values. Scatter dots do not open the storm panel.</li>
                <li style={li}><strong>Heatmap</strong> — density of the 6-hour track points.</li>
                <li style={li}><strong>Grid</strong> — 3D bars counting 6-hour track points per cell. Hover a bar for the count.</li>
                <li style={li}><strong>Max Wind Grid</strong> — 3D bars of the strongest wind in each cell. Hover a bar for that wind, in kt.</li>
            </ul>

            <h3 style={sectionTitle}>Filters</h3>
            <ul style={list}>
                <li style={li}><strong>Basin</strong> — limit to one of the seven ocean basins, or All.</li>
                <li style={li}><strong>Name</strong> (Storm mode) — type to filter by storm name, e.g. <em>KATRINA</em>.</li>
                <li style={li}><strong>Min / Max Year</strong> and <strong>Min / Max Month</strong> — restrict the time window. The year bounds come from the loaded storm file.</li>
                <li style={li}><strong>Min / Max Wind</strong> — knots. Storm mode keeps storms whose peak wind is in range. The other modes keep individual points in range. A point with no reported wind is left out.</li>
                <li style={li}><strong>Filter by Pressure</strong> — enable, then set a min / max central pressure (mb). Storm mode uses the storm minimum. In the other modes, points without pressure are dropped.</li>
                <li style={li}><strong>System Status</strong> — Storm mode keeps storms that reached that status. The other modes keep points with that status.</li>
                <li style={li}><strong>Show spur tracks</strong> (Storm mode, off by default) — spur tracks duplicate another track. Heatmap, Grid, Max Wind Grid, and Scatter leave them out.</li>
                <li style={li}><strong>Show Max Wind Radii</strong> / <strong>Show 34/50/64 Wind Radii</strong> (Storm mode) — overlay the wind-field polygons.</li>
                <li style={li}><strong>Only 6 Hour Points</strong> (Scatter mode) — drop fixes that are not at 00:00, 06:00, 12:00, or 18:00. Heatmap and Grid always use those 6-hour points.</li>
            </ul>

            <h3 style={sectionTitle}>Storm detail (click a point in Storm mode)</h3>
            <ul style={list}>
                <li style={li}>Opens the storm at the bottom-left on a wide screen, or in a sheet at the bottom on a phone. The phone sheet can collapse to one row.</li>
                <li style={li}>The panel shows the name, season, a wind (kt) and pressure (mb) chart, and an <strong>infrared satellite image</strong> for the selected point — HURSAT-B1 for 1978–2015, RAMMB/CIRA for 2016 and later. If an exact frame is missing, a nearby one is shown.</li>
                <li style={li}>Use the <strong>Select Point</strong> slider, the <strong>&lt;</strong> / <strong>&gt;</strong> buttons, or the arrow keys to step through the storm. Arrow keys do nothing while a form field is focused. The image and the highlighted chart point update together.</li>
                <li style={li}>Close it with the <strong>×</strong> in its corner.</li>
            </ul>

            <h3 style={sectionTitle}>Other controls</h3>
            <ul style={list}>
                <li style={li}><strong>Hover</strong> a track point for a tooltip: name, date and time, position, wind in kt, pressure in mb, and the full status name. The track line does not show a tooltip.</li>
                <li style={li}><strong>Settings</strong> changes point size, line width, grid cell size, and heatmap radius for the current mode. On a wide screen it is the <em>Settings +</em> button at the bottom-right, beside Data &amp; imagery sources. On a phone it is the Rendering section of the Controls drawer.</li>
                <li style={li}><strong>Data &amp; imagery sources</strong> — attribution and links. It sits beside Settings on a wide screen, and in the Controls drawer on a phone.</li>
            </ul>

            <h3 style={sectionTitle}>Color scale (by wind speed)</h3>
            <p style={{ margin: "0 0 6px" }}>The same scale is drawn on the map. Lightness rises from tropical depression to Category 5.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                {WIND_CATEGORIES.map((entry) => (
                    <div key={entry.label} style={scaleRow}>
                        <span style={swatch(entry.color)} />
                        <span>{entry.label}</span>
                    </div>
                ))}
                <div style={scaleRow}>
                    <span style={swatch(MISSING_WIND_COLOR)} />
                    <span>{MISSING_WIND_LABEL} — not on this scale</span>
                </div>
            </div>
        </HelpModal>
    );
}

export default React.memo(HelpPanel);
