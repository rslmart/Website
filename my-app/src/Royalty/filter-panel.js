import React from 'react';
import Select from 'react-select';

function FilterPanel(props) {
    const {filterPanelOpen, selectedRoot, rootOptions, selectRoot, numberOfAncestors, numberOfDescendants, onChange,
        toggleFilterPanel} = props;

    return (filterPanelOpen ?
                <div className="control-panel">
                    <div style={{height: "25px", marginBottom: 0, paddingBottom: 0}}>
                        <h3 style={{float: "left", marginTop: 0, marginBottom: 0}}>Filter Data</h3>
                        <button onClick={evt => toggleFilterPanel(evt)} style={{float: "right", }}>-</button>
                    </div>
                    <div>
                        <div key={'plotType'} className="select" style={{marginTop: 10}}>
                            <label>Root: </label>
                            <Select
                                value={selectedRoot}
                                onChange={selectRoot}
                                options={rootOptions}
                            />
                        </div>
                        <div key={'numberOfAncestors'} className="input">
                            <label>Number of Ancestors: </label>
                            <input
                                name="numberOfAncestors"
                                type="number"
                                value={numberOfAncestors}
                                min={0}
                                max={9000}
                                onChange={evt => onChange(evt)}
                            />
                        </div>
                        <div key={'numberOfDescendants'} className="input">
                            <label>Number of Descendants: </label>
                            <input
                                name="numberOfDescendants"
                                type="number"
                                value={numberOfDescendants}
                                min={0}
                                max={9000}
                                onChange={evt => onChange(evt)}
                            />
                        </div>
                    </div>
                </div> :
                <button onClick={evt => toggleFilterPanel(evt)} style={{position: "absolute", top: 20, right: 20}}>+</button>
    );
}

export default React.memo(FilterPanel);