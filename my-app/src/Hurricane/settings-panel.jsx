import * as React from 'react';
import {PLOT_TYPES} from "./Hurricane";

// Positioned by the bottom-right control stack in Hurricane.jsx.
const settingsPanelStyles = {
    maxWidth: '320px',
    backgroundColor: 'var(--color-surface)',
    boxShadow: 'var(--shadow-panel)',
    borderRadius: 'var(--radius)',
    padding: '6px 12px',
    fontSize: '13px',
    lineHeight: 2,
    color: 'var(--color-text-muted)',
    outline: 'none',
};

// Matches the collapsed "Filters +" button in filter-panel.jsx.
const openButtonStyles = {
    border: "none",
    backgroundColor: "var(--color-surface)",
    boxShadow: "var(--shadow-panel)",
    borderRadius: "var(--radius-sm)",
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--color-text)",
    cursor: "pointer",
    minHeight: 44,
    minWidth: 44,
};

function NumberField({ label, name, value, min, max, settings, onSettingsChange, embedded }) {
    return (
        <div>
            <label htmlFor={name} style={embedded ? { display: "block", fontSize: 16, lineHeight: 1.35 } : undefined}>
                {label}{embedded ? "" : ": "}
            </label>
            <input
                id={name}
                name={name}
                type="number"
                value={value}
                min={min}
                max={max}
                onChange={evt => onSettingsChange(evt, settings)}
                style={embedded ? { minHeight: 44, minWidth: 44, fontSize: 16, width: "100%", boxSizing: "border-box" } : undefined}
            />
        </div>
    );
}

function SettingsPanel(props) {
    const openButtonRef = React.useRef(null);
    const collapseButtonRef = React.useRef(null);
    const wasOpen = React.useRef(props.settingsOpen);
    // The open and collapse buttons are different elements, so move focus to
    // whichever one is now rendered after a toggle (otherwise it drops to body).
    React.useEffect(() => {
        if (props.embedded || wasOpen.current === props.settingsOpen) return;
        wasOpen.current = props.settingsOpen;
        (props.settingsOpen ? collapseButtonRef : openButtonRef).current?.focus();
    }, [props.settingsOpen, props.embedded]);
    const {settingsOpen, onSettingsChange, toggleSettingsPanel, scatterplotSettings, lineSettings, gridSettings,
        heatmapSettings, plotType, embedded
    } = props;
    const {radiusScale, radiusMinPixels, radiusMaxPixels, lineWidthScale, lineWidthMinPixels, lineWidthMaxPixels}
        = scatterplotSettings;
    const {widthScale, widthMinPixels, widthMaxPixels} = lineSettings;
    const {cellSize, elevationScale} = gridSettings;
    const {radiusPixels, intensity, threshold} = heatmapSettings;

    const field = (label, name, value, min, settings) => (
        <NumberField
            label={label}
            name={name}
            value={value}
            min={min}
            max={Number.MAX_SAFE_INTEGER}
            settings={settings}
            onSettingsChange={onSettingsChange}
            embedded={embedded}
        />
    );
    const heading = (text) => (
        <div style={embedded ? { fontSize: 16, fontWeight: 600, marginTop: 8 } : undefined}>{text}</div>
    );

    const scatterplotDiv = (
        <div>
            {heading("Scatterplot")}
            {field("Point size", "radiusScale", radiusScale, 1, scatterplotSettings)}
            {field("Minimum point size (px)", "radiusMinPixels", radiusMinPixels, 0, scatterplotSettings)}
            {field("Maximum point size (px)", "radiusMaxPixels", radiusMaxPixels, 0, scatterplotSettings)}
            {field("Outline width", "lineWidthScale", lineWidthScale, 1, scatterplotSettings)}
            {field("Thinnest outline (px)", "lineWidthMinPixels", lineWidthMinPixels, 0, scatterplotSettings)}
            {field("Thickest outline (px)", "lineWidthMaxPixels", lineWidthMaxPixels, 0, scatterplotSettings)}
        </div>
    );

    const lineDiv = (
        <div>
            {heading("Line")}
            {field("Line width", "widthScale", widthScale, 1, lineSettings)}
            {field("Thinnest line (px)", "widthMinPixels", widthMinPixels, 0, lineSettings)}
            {field("Thickest line (px)", "widthMaxPixels", widthMaxPixels, 0, lineSettings)}
        </div>
    );

    const gridDiv = (
        <div>
            {heading("Grid")}
            {field("Cell size (m)", "cellSize", cellSize, 1, gridSettings)}
            {field("Bar height", "elevationScale", elevationScale, 0, gridSettings)}
        </div>
    );

    const heatmapDiv = (
        <div>
            {heading("Heatmap")}
            {field("Blur radius (px)", "radiusPixels", radiusPixels, 1, heatmapSettings)}
            {field("Intensity", "intensity", intensity, 0, heatmapSettings)}
            {field("Threshold", "threshold", threshold, 0, heatmapSettings)}
        </div>
    );

    const getSettingsDiv = (plotType) => {
        if (plotType === PLOT_TYPES.STORM) {
            return (
                <div>
                    {scatterplotDiv}
                    {lineDiv}
                </div>
            );
        }
        if (plotType === PLOT_TYPES.SCATTER_PLOT) {
            return scatterplotDiv
        }
        if (plotType === PLOT_TYPES.HEATMAP) {
            return heatmapDiv
        }
        if (plotType === PLOT_TYPES.GRID || plotType === PLOT_TYPES.MAX_WIND_GRID) {
            return gridDiv
        }
        return <div/>;
    }

    if (embedded) {
        return getSettingsDiv(plotType);
    }

    return (settingsOpen ?
        <div style={settingsPanelStyles} role="region" aria-label="Rendering settings">
            <div style={{height: "40px", marginBottom: 0, paddingBottom: 0}}>
                <h3 style={{float: "left", marginTop: 0, marginBottom: 0, color: "var(--color-text)"}}>Settings</h3>
                <button
                    ref={collapseButtonRef}
                    type="button"
                    onClick={evt => toggleSettingsPanel(evt)}
                    style={{float: "right", border: "none", background: "none", fontSize: 20, lineHeight: 1, cursor: "pointer", color: "var(--color-text-muted)", minWidth: 44, minHeight: 44}}
                    aria-label="Collapse settings"
                    aria-expanded="true"
                >
                    -
                </button>
            </div>
            {getSettingsDiv(plotType)}
        </div> :
        <button
            ref={openButtonRef}
            onClick={evt => toggleSettingsPanel(evt)}
            style={openButtonStyles}
            aria-label="Open rendering settings"
            aria-expanded="false"
        >
            Settings +
        </button>
        );
}



export default React.memo(SettingsPanel);