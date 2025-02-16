import * as React from 'react';
import { PlotType } from './HurricaneClient';

export interface LayerSettings {
    name: string;
    [key: string]: number | boolean | string;
}

export interface ScatterplotSettings extends LayerSettings {
    name: 'scatterplotSettings';
    radiusScale: number;
    radiusMinPixels: number;
    radiusMaxPixels: number;
    lineWidthScale: number;
    lineWidthMinPixels: number;
    lineWidthMaxPixels: number;
}

export interface LineSettings extends LayerSettings {
    name: 'lineSettings';
    widthScale: number;
    widthMinPixels: number;
    widthMaxPixels: number;
}

export interface GridSettings extends LayerSettings {
    name: 'gridSettings';
    cellSize: number;
    elevationScale: number;
}

export interface HeatmapSettings extends LayerSettings {
    name: 'heatmapSettings';
    radiusPixels: number;
    intensity: number;
    threshold: number;
}

interface SettingsPanelProps {
    settingsOpen: boolean;
    plotType: PlotType;
    scatterplotSettings: ScatterplotSettings;
    lineSettings: LineSettings;
    gridSettings: GridSettings;
    heatmapSettings: HeatmapSettings;
    onSettingsChange: (event: React.ChangeEvent<HTMLInputElement>, settings: LayerSettings) => void;
    toggleSettingsPanel: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
                                                         settingsOpen,
                                                         plotType,
                                                         scatterplotSettings,
                                                         lineSettings,
                                                         gridSettings,
                                                         heatmapSettings,
                                                         onSettingsChange,
                                                         toggleSettingsPanel
                                                     }) => {
    const renderScatterplotSettings = () => {
        const { radiusScale, radiusMinPixels, radiusMaxPixels, lineWidthScale, lineWidthMinPixels, lineWidthMaxPixels } = scatterplotSettings;

        return (
            <div>
                <h4>Scatterplot Settings</h4>
                <div className="setting-row">
                    <label>Radius Scale:</label>
                    <input
                        name="radiusScale"
                        type="number"
                        value={radiusScale}
                        min={1}
                        onChange={(e) => onSettingsChange(e, scatterplotSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Radius Min Pixels:</label>
                    <input
                        name="radiusMinPixels"
                        type="number"
                        value={radiusMinPixels}
                        min={0}
                        onChange={(e) => onSettingsChange(e, scatterplotSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Radius Max Pixels:</label>
                    <input
                        name="radiusMaxPixels"
                        type="number"
                        value={radiusMaxPixels}
                        min={0}
                        onChange={(e) => onSettingsChange(e, scatterplotSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Line Width Scale:</label>
                    <input
                        name="lineWidthScale"
                        type="number"
                        value={lineWidthScale}
                        min={1}
                        onChange={(e) => onSettingsChange(e, scatterplotSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Line Width Min Pixels:</label>
                    <input
                        name="lineWidthMinPixels"
                        type="number"
                        value={lineWidthMinPixels}
                        min={0}
                        onChange={(e) => onSettingsChange(e, scatterplotSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Line Width Max Pixels:</label>
                    <input
                        name="lineWidthMaxPixels"
                        type="number"
                        value={lineWidthMaxPixels}
                        min={0}
                        onChange={(e) => onSettingsChange(e, scatterplotSettings)}
                    />
                </div>
            </div>
        );
    };

    const renderLineSettings = () => {
        const { widthScale, widthMinPixels, widthMaxPixels } = lineSettings;

        return (
            <div>
                <h4>Line Settings</h4>
                <div className="setting-row">
                    <label>Width Scale:</label>
                    <input
                        name="widthScale"
                        type="number"
                        value={widthScale}
                        min={1}
                        onChange={(e) => onSettingsChange(e, lineSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Width Min Pixels:</label>
                    <input
                        name="widthMinPixels"
                        type="number"
                        value={widthMinPixels}
                        min={0}
                        onChange={(e) => onSettingsChange(e, lineSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Width Max Pixels:</label>
                    <input
                        name="widthMaxPixels"
                        type="number"
                        value={widthMaxPixels}
                        min={0}
                        onChange={(e) => onSettingsChange(e, lineSettings)}
                    />
                </div>
            </div>
        );
    };

    const renderGridSettings = () => {
        const { cellSize, elevationScale } = gridSettings;

        return (
            <div>
                <h4>Grid Settings</h4>
                <div className="setting-row">
                    <label>Cell Size:</label>
                    <input
                        name="cellSize"
                        type="number"
                        value={cellSize}
                        min={1}
                        onChange={(e) => onSettingsChange(e, gridSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Elevation Scale:</label>
                    <input
                        name="elevationScale"
                        type="number"
                        value={elevationScale}
                        min={0}
                        onChange={(e) => onSettingsChange(e, gridSettings)}
                    />
                </div>
            </div>
        );
    };

    const renderHeatmapSettings = () => {
        const { radiusPixels, intensity, threshold } = heatmapSettings;

        return (
            <div>
                <h4>Heatmap Settings</h4>
                <div className="setting-row">
                    <label>Radius Pixels:</label>
                    <input
                        name="radiusPixels"
                        type="number"
                        value={radiusPixels}
                        min={1}
                        onChange={(e) => onSettingsChange(e, heatmapSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Intensity:</label>
                    <input
                        name="intensity"
                        type="number"
                        value={intensity}
                        min={0}
                        step={0.1}
                        onChange={(e) => onSettingsChange(e, heatmapSettings)}
                    />
                </div>
                <div className="setting-row">
                    <label>Threshold:</label>
                    <input
                        name="threshold"
                        type="number"
                        value={threshold}
                        min={0}
                        step={0.1}
                        onChange={(e) => onSettingsChange(e, heatmapSettings)}
                    />
                </div>
            </div>
        );
    };

    const renderActiveSettings = () => {
        switch (plotType) {
            case PlotType.STORM:
                return (
                    <>
                        {renderScatterplotSettings()}
                        {renderLineSettings()}
                    </>
                );
            case PlotType.SCATTER_PLOT:
                return renderScatterplotSettings();
            case PlotType.HEATMAP:
                return renderHeatmapSettings();
            case PlotType.GRID:
            case PlotType.MAX_WIND_GRID:
                return renderGridSettings();
            default:
                return null;
        }
    };

    return settingsOpen ? (
        <div className="settings-panel">
            <div className="panel-header">
                <h3>Settings</h3>
                <button onClick={toggleSettingsPanel} className="close-button">
                    Close Settings
                </button>
            </div>
            {renderActiveSettings()}
        </div>
    ) : (
        <button onClick={toggleSettingsPanel} className="open-button">
            Open Settings
        </button>
    );
};

export default React.memo(SettingsPanel);