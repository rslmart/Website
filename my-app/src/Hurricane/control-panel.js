import * as React from 'react';

function ControlPanel(props) {
    const {plotType, plotTypeOptions, systemStatus, systemStatusOptions, minYear, maxYear, minWind, maxWind, landfall, only6Hour, onChange} = props;

    const PLOT_TYPE_DESCRIPTIONS = {
        STORM: "Showing the entire tracks of storm systems.",
        SCATTER_PLOT: "Showing individual track points.",
        HEATMAP: "Showing heatmap from individual track points.",
        GRID: "Showing bar graph from sum of individual points in the column area.",
        MAX_WIND_GRID: "Showing bar graph from the max wind of all individual points in the column area."
    }

    return (
        <div className="control-panel">
            <h3>Hurdat Hurricane Data</h3>
            <p>
                {PLOT_TYPE_DESCRIPTIONS[plotType]}
            </p>

            <div>
                <label>Mode: </label>
                <select name="plotType" value={plotType} onChange={evt => onChange(evt)}>
                    {Object.values(plotTypeOptions).map(option =>
                        <option key={option} value={option}>{option}</option>)}
                </select>
            </div>

            <div key={'minYear'} className="input">
                <label>Min Year: </label>
                <input
                    name="minYear"
                    type="number"
                    value={minYear}
                    min={1851}
                    max={2021}
                    onChange={evt => onChange(evt)}
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
                    onChange={evt => onChange(evt)}
                />
            </div>

            <div key={'minWind'} className="input">
                <label>Min Wind: {minWind}</label>
                <input
                    name="minWind"
                    type="range"
                    value={minWind}
                    min={0}
                    max={165}
                    step={5}
                    onChange={evt => onChange(evt)}
                />
            </div>

            <div key={'maxWind'} className="input">
                <label>Max Wind: {maxWind}</label>
                <input
                    name="maxWind"
                    type="range"
                    value={maxWind}
                    min={0}
                    max={165}
                    step={5}
                    onChange={evt => onChange(evt)}
                />
            </div>

            <div key={'systemStatus'} className="select">
                <label>System Status: </label>
                <select name="systemStatus" value={systemStatus} onChange={evt => onChange(evt)}>
                    {Object.keys(systemStatusOptions).map(option =>
                        <option key={option} value={option}>{option}</option>)}
                </select>
            </div>

            <div key={'landfall'} className="input">
                <label>Landfall:</label>
                <input
                    type="checkbox"
                    name="landfall"
                    value={landfall}
                    onChange={evt => onChange(evt)}
                />
            </div>

            {plotType === "Scatter Plot" && <div key={'only6Hour'} className="input">
                <label>Only 6 Hour Points:</label>
                <input
                    type="checkbox"
                    name="only6Hour"
                    value={only6Hour}
                    onChange={evt => onChange(evt)}
                />
            </div>
            }
        </div>
    );
}

export default React.memo(ControlPanel);