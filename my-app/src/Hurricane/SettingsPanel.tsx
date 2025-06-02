import * as React from 'react';
import { PLOT_TYPES } from "./Hurricane";

interface SettingsPanelProps {
    settingsOpen: boolean;
    onSettingsChange: (event: React.ChangeEvent<HTMLInputElement>, settings: any) => void;
    toggleSettingsPanel: (event: React.MouseEvent<HTMLButtonElement>) => void;
    scatterplotSettings: {
        radiusScale: number;
        radiusMinPixels: number;
        radiusMaxPixels: number;
        lineWidthScale: number;
        lineWidthMinPixels: number;
        lineWidthMaxPixels: number;
    };
    lineSettings: {
        widthScale: number;
        widthMinPixels: number;
        widthMaxPixels: number;
    };
    gridSettings: {
        cellSize: number;
        elevationScale: number;
    };
    heatmapSettings: {
        radiusPixels: number;
        intensity: number;
        threshold: number;
    };
    plotType: keyof typeof PLOT_TYPES;
}

const settingsPanelStyles: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    right: 0,
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

const SettingsPanel: React.FC<SettingsPanelProps> = (props) => {
    const {
        settingsOpen,
        onSettingsChange,
        toggleSettingsPanel,
        scatterplotSettings,
        lineSettings,
        gridSettings,
        heatmapSettings,
        plotType
    } = props;

    const {
        radiusScale,
        radiusMinPixels,
        radiusMaxPixels,
        lineWidthScale,
        lineWidthMinPixels,
        lineWidthMaxPixels
    } = scatterplotSettings;

    const {
        widthScale,
        widthMinPixels,
        widthMaxPixels
    } = lineSettings;

    const {
        cellSize,
        elevationScale
    } = gridSettings;

    const {
        radiusPixels,
        intensity,
        threshold
    } = heatmapSettings;

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

    const getSettingsDiv = (plotType: keyof typeof PLOT_TYPES) => {
        switch (plotType) {
            case PLOT_TYPES.STORM:
                return (
                    <div>
                        {scatterplotDiv}
                        {lineDiv}
                    </div>
                );
            case PLOT_TYPES.SCATTER_PLOT:
                return scatterplotDiv;
            case PLOT_TYPES.HEATMAP:
                return heatmapDiv;
            case PLOT_TYPES.GRID:
            case PLOT_TYPES.MAX_WIND_GRID:
                return gridDiv;
            default:
                return <div />;
        }
    }

    return settingsOpen ? (
        <div style={settingsPanelStyles}>
            <div style={{ height: "40px", marginBottom: 0, paddingBottom: 0 }}>
                <h3 style={{ float: "left", marginTop: 0, marginBottom: 0 }}>Settings</h3>
                <button onClick={toggleSettingsPanel} style={{ float: "right" }}>-</button>
            </div>
            {getSettingsDiv(plotType)}
        </div>
    ) : (
        <button onClick={toggleSettingsPanel} style={{ position: "absolute", bottom: 20, right: 20 }}>+</button>
    );
}

export default React.memo(SettingsPanel);