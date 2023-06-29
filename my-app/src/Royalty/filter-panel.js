import React from 'react';
import Select from 'react-select';

function FilterPanel(props) {
    const {filterPanelOpen, graphType, graphTypeOptions, selectedMonarchs, monarchyOptions, selectedRoot, rootOptions, selectRoot, numberOfAncestors, numberOfDescendants, onChange,
        toggleFilterPanel} = props;
    if (!filterPanelOpen) {
        return (<button onClick={evt => toggleFilterPanel(evt)} style={{position: "absolute", top: 20, right: 20}}>+</button>);
    }
    let content = (<div/>);
    if (graphType === "family_tree") {
        content = (
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
                        max={200}
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
                        max={200}
                        onChange={evt => onChange(evt)}
                    />
                </div>
            </div>
        );
    }
    if (graphType === "monarchs") {
        content = (
            <div>
                <div key={'selectMonarchy'} className="select" style={{marginTop: 10}}>
                    <label>Monarchy: </label>
                    <select name="selectedMonarchs" value={selectedMonarchs} onChange={onChange}>
                        {monarchyOptions.map(option =>
                            <option key={option} value={option}>{option}</option>)}
                    </select>
                </div>
            </div>
        );
    }
    return (
        <div className="control-panel">
            <div style={{height: "25px", marginBottom: 0, paddingBottom: 0}}>
                <h3 style={{float: "left", marginTop: 0, marginBottom: 0}}>Filter Data</h3>
                <button onClick={evt => toggleFilterPanel(evt)} style={{float: "right", }}>-</button>
            </div>
             <div key={'selectRoot'} className="select" style={{marginTop: 10}}>
                <label>Graph Type: </label>
                <select name="graphType" value={graphType} onChange={onChange}>
                    {Object.values(graphTypeOptions).map(option =>
                        <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </div>
            {content}
        </div>
    );
}

export default React.memo(FilterPanel);