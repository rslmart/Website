import * as React from 'react';

function ControlPanel(props) {
    const {min_year, max_year, min_wind, max_wind, only_6_hour} = props;

    return (
        <div className="control-panel">
            <h3>Hurdat Hurricane Data</h3>
            <p>
                Map showing hurricane tracking data.
            </p>
            <p>
            </p>
            <hr />

            <div key={'min_year'} className="input">
                <label>Min Year: {min_year}</label>
                <input
                    name="min_year"
                    type="range"
                    value={min_year}
                    min={1851}
                    max={2021}
                    step={1}
                    onChange={evt => props.onChange(evt)}
                />
            </div>

            <div key={'max_year'} className="input">
                <label>Max Year: {max_year}</label>
                <input
                    name="max_year"
                    type="range"
                    value={max_year}
                    min={1851}
                    max={2021}
                    step={1}
                    onChange={evt => props.onChange(evt)}
                />
            </div>

            <div key={'min_wind'} className="input">
                <label>Min Wind: {min_wind}</label>
                <input
                    name="min_wind"
                    type="range"
                    value={min_wind}
                    min={0}
                    max={200}
                    step={1}
                    onChange={evt => props.onChange(evt)}
                />
            </div>

            <div key={'max_wind'} className="input">
                <label>Max Wind: {max_wind}</label>
                <input
                    name="max_wind"
                    type="range"
                    value={max_wind}
                    min={0}
                    max={200}
                    step={1}
                    onChange={evt => props.onChange(evt)}
                />
            </div>

            <div key={'only_6_hour'} className="input">
                <label>Only 6 Hour Points:</label>
                <input
                    type="checkbox"
                    name="only_6_hour"
                    value={only_6_hour}
                    onChange={evt => props.onChange(evt)}
                />
            </div>
        </div>
    );
}

export default React.memo(ControlPanel);