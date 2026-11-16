import * as React from 'react';
import {PLOT_TYPES} from "./Hurricane";

// Positioned by the bottom-right control stack in Hurricane.jsx.
const settingsPanelStyles = {
    maxWidth: '320px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    padding: '6px 12px',
    fontSize: '13px',
    lineHeight: 2,
    color: '#6b6b76',
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
};

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

    const scatterplotDiv = (
        <div>
            <label>Scatterplot</label>
            <div>
                <label>radiusScale: </label>
                <input
                    name="radiusScale"
                    type="number"
                    value={radiusScale}
                    min={1}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, scatterplotSettings)}
                />
            </div>
            <div>
                <label>radiusMinPixels: </label>
                <input
                    name="radiusMinPixels"
                    type="number"
                    value={radiusMinPixels}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                   onChange={evt => onSettingsChange(evt, scatterplotSettings)}
                />
            </div>
            <div>
                <label>radiusMaxPixels: </label>
                <input
                    name="radiusMaxPixels"
                    type="number"
                    value={radiusMaxPixels}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                   onChange={evt => onSettingsChange(evt, scatterplotSettings)}
                />
            </div>
            <div>
                <label>lineWidthScale: </label>
                <input
                    name="lineWidthScale"
                    type="number"
                    value={lineWidthScale}
                    min={1}
                    max={Number.MAX_SAFE_INTEGER}
                   onChange={evt => onSettingsChange(evt, scatterplotSettings)}
                />
            </div>
            <div>
                <label>lineWidthMinPixels: </label>
                <input
                    name="lineWidthMinPixels"
                    type="number"
                    value={lineWidthMinPixels}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                   onChange={evt => onSettingsChange(evt, scatterplotSettings)}
                />
            </div>
            <div>
                <label>lineWidthMaxPixels: </label>
                <input
                    name="lineWidthMaxPixels"
                    type="number"
                    value={lineWidthMaxPixels}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                   onChange={evt => onSettingsChange(evt, scatterplotSettings)}
                />
            </div>
        </div>
    );

    const lineDiv = (
        <div>
            <label>Line</label>
            <div>
                <label>widthScale: </label>
                <input
                    name="widthScale"
                    type="number"
                    value={widthScale}
                    min={1}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, lineSettings)}
                />
            </div>
            <div>
                <label>widthMinPixels: </label>
                <input
                    name="widthMinPixels"
                    type="number"
                    value={widthMinPixels}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, lineSettings)}
                />
            </div>
            <div>
                <label>widthMaxPixels: </label>
                <input
                    name="widthMaxPixels"
                    type="number"
                    value={widthMaxPixels}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, lineSettings)}
                />
            </div>
        </div>
    );

    const gridDiv = (
        <div>
            <label>Grid</label>
            <div>
                <label>cellSize: </label>
                <input
                    name="cellSize"
                    type="number"
                    value={cellSize}
                    min={1}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, gridSettings)}
                />
            </div>
            <div>
                <label>elevationScale: </label>
                <input
                    name="elevationScale"
                    type="number"
                    value={elevationScale}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, gridSettings)}
                />
            </div>
        </div>
    );

    const heatmapDiv = (
        <div>
            <label>Heatmap</label>
            <div>
                <label>radiusPixels: </label>
                <input
                    name="radiusPixels"
                    type="number"
                    value={radiusPixels}
                    min={1}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, heatmapSettings)}
                />
            </div>
            <div>
                <label>intensity: </label>
                <input
                    name="intensity"
                    type="number"
                    value={intensity}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, heatmapSettings)}
                />
            </div>
            <div>
                <label>threshold: </label>
                <input
                    name="threshold"
                    type="number"
                    value={threshold}
                    min={0}
                    max={Number.MAX_SAFE_INTEGER}
                    onChange={evt => onSettingsChange(evt, heatmapSettings)}
                />
            </div>
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
                <h3 style={{float: "left", marginTop: 0, marginBottom: 0}}>Settings</h3>
                <button
                    ref={collapseButtonRef}
                    onClick={evt => toggleSettingsPanel(evt)}
                    style={{float: "right", }}
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