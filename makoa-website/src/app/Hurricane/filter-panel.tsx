import * as React from 'react';
import {Basin, PlotType, SystemStatus} from "@/app/Hurricane/HurricaneClient";

interface FilterPanelProps {
    filterPanelOpen: boolean;
    plotType: PlotType;
    plotTypeOptions: Record<string, PlotType>;
    basin: Basin;
    basinOptions: Record<Basin, string>;
    name: string;
    systemStatus: SystemStatus;
    systemStatusOptions: Record<SystemStatus, string>;
    minYear: number;
    maxYear: number;
    minMonth: number;
    maxMonth: number;
    minWind: number;
    maxWind: number;
    filterByPressure: boolean;
    minPressure: number;
    maxPressure: number;
    landfall: boolean;
    showMaxWindPoly: boolean;
    showWindPoly: boolean;
    only6Hour: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    toggleFilterPanel: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const PLOT_TYPE_DESCRIPTIONS: Record<PlotType, string> = {
    'Storm': "Showing the entire tracks of storm systems.",
    'Scatter Plot': "Showing individual track points.",
    'Heatmap': "Showing heatmap from individual track points.",
    'Grid': "Showing bar graph from sum of individual points in the column area.",
    'Max Wind Grid': "Showing bar graph from the max wind of all individual points in the column area."
};

const FilterPanel: React.FC<FilterPanelProps> = React.memo((props) => {
    const {
        filterPanelOpen,
        plotType,
        plotTypeOptions,
        basin,
        basinOptions,
        name,
        systemStatus,
        systemStatusOptions,
        minYear,
        maxYear,
        minMonth,
        maxMonth,
        minWind,
        maxWind,
        filterByPressure,
        minPressure,
        maxPressure,
        landfall,
        showMaxWindPoly,
        showWindPoly,
        only6Hour,
        onChange,
        toggleFilterPanel
    } = props;

    if (!filterPanelOpen) {
        return (
            <button
                onClick={toggleFilterPanel}
                style={{ position: "absolute", top: 20, right: 20 }}
            >
                Open
            </button>
        );
    }

    return (
        <div className="control-panel">
            <div style={{ height: "25px", marginBottom: 0, paddingBottom: 0 }}>
                <h3 style={{ float: "left", marginTop: 0, marginBottom: 0 }}>
                    Hurdat Hurricane Data
                </h3>
                <button
                    onClick={toggleFilterPanel}
                    style={{ float: "right" }}
                >
                    Close
                </button>
            </div>

            <div>
                <div className="select" style={{ marginTop: 10 }}>
                    <label>Mode: </label>
                    <select
                        name="plotType"
                        value={plotType}
                        onChange={onChange}
                    >
                        {Object.values(plotTypeOptions).map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                    <div className="description">
                        {PLOT_TYPE_DESCRIPTIONS[plotType]}
                    </div>
                </div>

                <div className="select" style={{ marginTop: 10 }}>
                    <label>Basin: </label>
                    <select
                        name="basin"
                        value={basin}
                        onChange={onChange}
                    >
                        {Object.entries(basinOptions).map(([key, value]) => (
                            <option key={key} value={key}>
                                {value}
                            </option>
                        ))}
                    </select>
                </div>

                {plotType === 'Storm' && (
                    <div className="input">
                        <label>Name: </label>
                        <input
                            name="name"
                            value={name}
                            onChange={onChange}
                            placeholder="Enter storm name"
                        />
                    </div>
                )}

                <div className="input-range-group">
                    <div className="input">
                        <label>Year Range: </label>
                        <div className="range-container">
                            <input
                                name="minYear"
                                type="number"
                                value={minYear}
                                min={1851}
                                max={maxYear}
                                onChange={onChange}
                            />
                            <span>-</span>
                            <input
                                name="maxYear"
                                type="number"
                                value={maxYear}
                                min={minYear}
                                max={2021}
                                onChange={onChange}
                            />
                        </div>
                    </div>

                    <div className="input">
                        <label>Month Range: </label>
                        <div className="range-sliders">
                            <input
                                name="minMonth"
                                type="range"
                                value={minMonth}
                                min={1}
                                max={12}
                                onChange={onChange}
                            />
                            <input
                                name="maxMonth"
                                type="range"
                                value={maxMonth}
                                min={1}
                                max={12}
                                onChange={onChange}
                            />
                        </div>
                        <div className="range-labels">
                            <span>{minMonth}</span>
                            <span>-</span>
                            <span>{maxMonth}</span>
                        </div>
                    </div>
                </div>

                <div className="input-checkbox">
                    <label>
                        <input
                            type="checkbox"
                            name="filterByPressure"
                            checked={filterByPressure}
                            onChange={onChange}
                        />
                        Filter by Pressure
                    </label>
                </div>

                {filterByPressure && (
                    <div className="pressure-range">
                        <div className="input">
                            <label>Pressure Range (hPa): </label>
                            <div className="range-sliders">
                                <input
                                    name="minPressure"
                                    type="range"
                                    value={minPressure}
                                    min={870}
                                    max={1024}
                                    onChange={onChange}
                                />
                                <input
                                    name="maxPressure"
                                    type="range"
                                    value={maxPressure}
                                    min={870}
                                    max={1024}
                                    onChange={onChange}
                                />
                            </div>
                            <div className="range-labels">
                                <span>{minPressure}</span>
                                <span>-</span>
                                <span>{maxPressure}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="input">
                    <label>Wind Speed (knots): </label>
                    <div className="range-sliders">
                        <input
                            name="minWind"
                            type="range"
                            value={minWind}
                            min={0}
                            max={190}
                            onChange={onChange}
                        />
                        <input
                            name="maxWind"
                            type="range"
                            value={maxWind}
                            min={0}
                            max={190}
                            onChange={onChange}
                        />
                    </div>
                    <div className="range-labels">
                        <span>{minWind}</span>
                        <span>-</span>
                        <span>{maxWind}</span>
                    </div>
                </div>

                <div className="select">
                    <label>System Status: </label>
                    <select
                        name="systemStatus"
                        value={systemStatus}
                        onChange={onChange}
                    >
                        {Object.keys(systemStatusOptions).map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </div>

                {plotType === 'Storm' && (
                    <div className="checkbox-group">
                        <div className="input-checkbox">
                            <label>
                                <input
                                    type="checkbox"
                                    name="showMaxWindPoly"
                                    checked={showMaxWindPoly}
                                    onChange={onChange}
                                />
                                Show Max Wind Radii
                            </label>
                        </div>
                        <div className="input-checkbox">
                            <label>
                                <input
                                    type="checkbox"
                                    name="showWindPoly"
                                    checked={showWindPoly}
                                    onChange={onChange}
                                />
                                Show 34/50/64kt Wind Radii
                            </label>
                        </div>
                    </div>
                )}

                {plotType === 'Scatter Plot' && (
                    <div className="input-checkbox">
                        <label>
                            <input
                                type="checkbox"
                                name="only6Hour"
                                checked={only6Hour}
                                onChange={onChange}
                            />
                            Only 6-hour Points
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
});

export default FilterPanel;