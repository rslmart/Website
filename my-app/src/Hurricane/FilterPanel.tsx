import * as React from 'react';

interface FilterPanelProps {
    filterPanelOpen: boolean;
    plotType: string;
    plotTypeOptions: Record<string, string>;
    basin: string;
    basinOptions: Record<string, string>;
    name: string;
    systemStatus: string;
    systemStatusOptions: Record<string, string>;
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

const FilterPanel: React.FC<FilterPanelProps> = (props) => {
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

    const PLOT_TYPE_DESCRIPTIONS: Record<string, string> = {
        STORM: "Showing the entire tracks of storm systems.",
        SCATTER_PLOT: "Showing individual track points.",
        HEATMAP: "Showing heatmap from individual track points.",
        GRID: "Showing bar graph from sum of individual points in the column area.",
        MAX_WIND_GRID: "Showing bar graph from the max wind of all individual points in the column area."
    };

    const controlPanelStyles: React.CSSProperties = {
        position: 'absolute',
        top: 0,
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

    return filterPanelOpen ? (
        <div style={controlPanelStyles}>
            <div style={{ height: "25px", marginBottom: 0, paddingBottom: 0 }}>
                <h3 style={{ float: "left", marginTop: 0, marginBottom: 0 }}>Hurdat Hurricane Data</h3>
                <button onClick={toggleFilterPanel} style={{ float: "right" }}>-</button>
            </div>
            <div>
                <div key={'plotType'} className="select" style={{ marginTop: 10 }}>
                    <label>Mode: </label>
                    <select name="plotType" value={plotType} onChange={onChange}>
                        {Object.values(plotTypeOptions).map(option =>
                            <option key={option} value={option}>{option}</option>)}
                    </select>
                </div>

                <div key={'basin'} className="select" style={{ marginTop: 10 }}>
                    <label>Basin: </label>
                    <select name="basin" value={basin} onChange={onChange}>
                        {Object.keys(basinOptions).map(key =>
                            <option key={key} value={key}>{basinOptions[key]}</option>)}
                    </select>
                </div>

                {plotType === "Storm" &&
                    <div key={'name'} className="input">
                        <label>Name: </label>
                        <input
                            name="name"
                            value={name}
                            onChange={onChange}
                        />
                    </div>
                }

                <div key={'minYear'} className="input">
                    <label>Min Year: </label>
                    <input
                        name="minYear"
                        type="number"
                        value={minYear}
                        min={1851}
                        max={2021}
                        onChange={onChange}
                    />
                </div>

                <div key={'maxYear'} className="input">
                    <label>Max Year: </label>
                    <input
                        name="maxYear"
                        type="number"
                        value={maxYear}
                        min={1851}
                        max={2021}
                        onChange={onChange}
                    />
                </div>

                <div key={'minMonth'} className="input">
                    <label>Min Month: {minMonth}</label>
                    <input
                        name="minMonth"
                        type="range"
                        value={minMonth}
                        min={1}
                        max={12}
                        onChange={onChange}
                    />
                </div>

                <div key={'maxMonth'} className="input">
                    <label>Max Month: {maxMonth}</label>
                    <input
                        name="maxMonth"
                        type="range"
                        value={maxMonth}
                        min={1}
                        max={12}
                        onChange={onChange}
                    />
                </div>

                <div key={'filterByPressure'} className="input">
                    <label>Filter by Pressure:</label>
                    <input
                        type="checkbox"
                        name="filterByPressure"
                        checked={filterByPressure}
                        onChange={onChange}
                    />
                </div>

                {filterByPressure &&
                    (<div>
                        <div key={'minPressure'} className="input">
                            <label>Min Pressure: {minPressure}</label>
                            <input
                                name="minPressure"
                                type="range"
                                value={minPressure}
                                min={870}
                                max={1024}
                                step={1}
                                onChange={onChange}
                            />
                        </div>

                        <div key={'maxPressure'} className="input">
                            <label>Max Pressure: {maxPressure}</label>
                            <input
                                name="maxPressure"
                                type="range"
                                value={maxPressure}
                                min={870}
                                max={1024}
                                step={1}
                                onChange={onChange}
                            />
                        </div>
                    </div>)
                }

                <div key={'minWind'} className="input">
                    <label>Min Wind: {minWind}</label>
                    <input
                        name="minWind"
                        type="range"
                        value={minWind}
                        min={0}
                        max={190}
                        step={5}
                        onChange={onChange}
                    />
                </div>

                <div key={'maxWind'} className="input">
                    <label>Max Wind: {maxWind}</label>
                    <input
                        name="maxWind"
                        type="range"
                        value={maxWind}
                        min={0}
                        max={190}
                        step={5}
                        onChange={onChange}
                    />
                </div>

                <div key={'systemStatus'} className="select">
                    <label>System Status: </label>
                    <select name="systemStatus" value={systemStatus} onChange={onChange}>
                        {Object.keys(systemStatusOptions).map(option =>
                            <option key={option} value={option}>{option}</option>)}
                    </select>
                </div>

                {plotType === "Storm" && <div>
                    <div key={'showMaxWindPoly'} className="input">
                        <label>Show Max Wind Radii:</label>
                        <input
                            type="checkbox"
                            name="showMaxWindPoly"
                            checked={showMaxWindPoly}
                            onChange={onChange}
                        />
                    </div>

                    <div key={'showWindPoly'} className="input">
                        <label>Show 34/50/64 Wind Radii:</label>
                        <input
                            type="checkbox"
                            name="showWindPoly"
                            checked={showWindPoly}
                            onChange={onChange}
                        />
                    </div>
                </div>
                }

                {plotType === "Scatter Plot" && <div key={'only6Hour'} className="input">
                    <label>Only 6 Hour Points:</label>
                    <input
                        type="checkbox"
                        name="only6Hour"
                        checked={only6Hour}
                        onChange={onChange}
                    />
                </div>
                }
            </div>
        </div>
    ) : (
        <button onClick={toggleFilterPanel} style={{ position: "absolute", top: 20, right: 20 }}>+</button>
    );
};

export default React.memo(FilterPanel);