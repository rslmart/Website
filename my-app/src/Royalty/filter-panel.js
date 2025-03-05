import React from 'react';
import PropTypes from 'prop-types';

// Constants
const PANEL_STYLES = {
    toggleButton: {
        position: "absolute",
        top: 20,
        right: 20,
        padding: "5px 10px",
        cursor: "pointer",
    },
    header: {
        height: "25px",
        marginBottom: 0,
        paddingBottom: 0,
    },
    panelTitle: {
        float: "left",
        marginTop: 0,
        marginBottom: 0,
    },
    selectContainer: {
        marginTop: 10,
    },
};

function FilterPanel(props) {
    const {
        filterPanelOpen,
        selectedMonarchs,
        monarchyOptions,
        onChange,
        toggleFilterPanel,
    } = props;

    if (!filterPanelOpen) {
        return (
            <button
                onClick={toggleFilterPanel}
                style={PANEL_STYLES.toggleButton}
                aria-label="Open filters"
            >
                +
            </button>
        );
    }

    return (
        <div className="control-panel">
            <div style={PANEL_STYLES.header}>
                <h3 style={PANEL_STYLES.panelTitle}>Filter Data</h3>
                {/*<button*/}
                {/*    onClick={toggleFilterPanel}*/}
                {/*    style={PANEL_STYLES.toggleButton}*/}
                {/*    aria-label="Close filters"*/}
                {/*>*/}
                {/*    -*/}
                {/*</button>*/}
            </div>

            <div style={PANEL_STYLES.selectContainer}>
                <label htmlFor="monarchySelect">Monarchy: </label>
                <select
                    id="monarchySelect"
                    name="selectedMonarchs"
                    value={selectedMonarchs}
                    onChange={(e) => onChange("selectedMonarchs", e.target.value)}
                >
                    {monarchyOptions.map(option => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

FilterPanel.propTypes = {
    filterPanelOpen: PropTypes.bool.isRequired,
    selectedMonarchs: PropTypes.string.isRequired,
    monarchyOptions: PropTypes.arrayOf(PropTypes.string).isRequired,
    onChange: PropTypes.func.isRequired,
    toggleFilterPanel: PropTypes.func.isRequired,
};

export default React.memo(FilterPanel);