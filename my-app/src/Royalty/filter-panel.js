import React from 'react';
import PropTypes from 'prop-types';
import './RoyalTreeStyle.css'

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
        selectedMonarchs,
        monarchyOptions,
        onChange,
    } = props;

    return (
        <div>
            <div style={PANEL_STYLES.header}>
                <h3 style={PANEL_STYLES.panelTitle}>Filter Data</h3>
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
    selectedMonarchs: PropTypes.string.isRequired,
    monarchyOptions: PropTypes.arrayOf(PropTypes.string).isRequired,
    onChange: PropTypes.func.isRequired,
};

export default React.memo(FilterPanel);