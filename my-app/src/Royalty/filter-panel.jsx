import React from 'react';
import PropTypes from 'prop-types';
import { monarchyColors, SUCCESSION_EDGE_COLOR, RANK_TIERS } from './RoyalTreeUtils';
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
    checkboxList: {
        marginTop: 8,
        maxHeight: 160,
        overflowY: "auto",
        border: "1px solid #ddd",
        borderRadius: 4,
        padding: "4px 8px",
    },
    checkboxRow: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 0",
        cursor: "pointer",
        fontSize: 14,
    },
    legend: {
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid #eee",
        fontSize: 11,
        color: "#7f8c8d",
    },
    legendRow: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 0",
    },
    legendSwatch: {
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: 2,
        boxSizing: "border-box",
    },
    legendSharedSwatch: {
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: 2,
        border: "3px solid #ff8c00",
        boxSizing: "border-box",
    },
    legendName: {
        flex: 1,
    },
    legendCount: {
        color: "#2c3e50",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
    },
    connections: {
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid #eee",
    },
    groupBlock: {
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid #eee",
    },
    groupTitle: {
        fontSize: 12,
        fontWeight: 600,
        color: "#2c3e50",
        marginBottom: 6,
    },
    connectionsTitle: {
        fontSize: 12,
        fontWeight: 600,
        color: "#2c3e50",
        marginBottom: 6,
    },
    connectionsRow: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "#34495e",
        padding: "3px 0",
    },
    connectionsHint: {
        fontSize: 11,
        color: "#95a5a6",
        marginTop: 4,
    },
    depthValue: {
        marginLeft: "auto",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        color: "#2c3e50",
    },
};

// The upward-ancestor data baked into each payload only reaches this many
// generations, so widening past it adds nothing.
const MAX_BRIDGE_DEPTH = 5;

function FilterPanel(props) {
    const {
        selectedMonarchs,
        monarchyOptions,
        houseOptions,
        memberCounts,
        sharedCount,
        bridgeOptions,
        onBridgeChange,
        rankOptions,
        onRankChange,
        showSuccession,
        onToggleSuccession,
        onChange,
        embedded,
    } = props;

    const selectedSet = new Set(selectedMonarchs);
    const houseIdSet = new Set(houseOptions.map(h => h.id));
    const anyHouseSelected = selectedMonarchs.some(m => houseIdSet.has(m));
    const visibleRanks = new Set(rankOptions.visibleRanks);

    const toggle = (option) => {
        const next = selectedSet.has(option)
            ? selectedMonarchs.filter(m => m !== option)
            : [...selectedMonarchs, option];
        onChange("selectedMonarchs", next);
    };

    const updateBridge = (patch) => {
        onBridgeChange({ ...bridgeOptions, ...patch });
    };

    const toggleRank = (tier) => {
        const next = visibleRanks.has(tier)
            ? rankOptions.visibleRanks.filter(t => t !== tier)
            : [...rankOptions.visibleRanks, tier];
        onRankChange({ ...rankOptions, visibleRanks: next });
    };

    return (
        <div className={embedded ? undefined : "control-panel"} style={embedded ? undefined : { width: 230 }}>
            <div style={PANEL_STYLES.header}>
                <h3 style={PANEL_STYLES.panelTitle}>Monarchies</h3>
            </div>

            <div style={PANEL_STYLES.selectContainer}>
                <div style={{ fontSize: 12, color: "#7f8c8d" }}>
                    Select one or more to compare
                </div>
                <div style={PANEL_STYLES.checkboxList}>
                    {monarchyOptions.map(option => (
                        <label key={option} style={PANEL_STYLES.checkboxRow}>
                            <input
                                type="checkbox"
                                checked={selectedSet.has(option)}
                                onChange={() => toggle(option)}
                            />
                            {option.replace(/_/g, ' ')}
                        </label>
                    ))}
                </div>

                {houseOptions.length > 0 && (
                    <div style={PANEL_STYLES.groupBlock}>
                        <div style={PANEL_STYLES.groupTitle}>Houses</div>
                        <div style={PANEL_STYLES.checkboxList}>
                            {houseOptions.map(house => (
                                <label key={house.id} style={PANEL_STYLES.checkboxRow}>
                                    <input
                                        type="checkbox"
                                        checked={selectedSet.has(house.id)}
                                        onChange={() => toggle(house.id)}
                                    />
                                    {house.name}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {anyHouseSelected && (
                    <div style={PANEL_STYLES.connections}>
                        <div style={PANEL_STYLES.connectionsTitle}>Ranks to show</div>
                        {RANK_TIERS.filter(r => r.tier > 0).map(({ tier, name }) => (
                            <label key={tier} style={PANEL_STYLES.connectionsRow}>
                                <input
                                    type="checkbox"
                                    checked={visibleRanks.has(tier)}
                                    onChange={() => toggleRank(tier)}
                                />
                                <span>{name}</span>
                            </label>
                        ))}
                        <div style={PANEL_STYLES.connectionsHint}>
                            Monarchs are always shown. Ancestors are added to connect them.
                        </div>
                    </div>
                )}

                {selectedMonarchs.length > 0 && (
                    <div style={PANEL_STYLES.legend}>
                        {selectedMonarchs.map((option, idx) => {
                            const colors = monarchyColors(idx);
                            const count = memberCounts[idx];
                            return (
                                <div key={option} style={PANEL_STYLES.legendRow}>
                                    <span style={{ ...PANEL_STYLES.legendSwatch, background: colors.male }} />
                                    <span style={{ ...PANEL_STYLES.legendSwatch, background: colors.female }} />
                                    <span style={PANEL_STYLES.legendName}>{option.replace(/_/g, ' ')}</span>
                                    {count != null && <span style={PANEL_STYLES.legendCount}>{count}</span>}
                                </div>
                            );
                        })}
                        {selectedMonarchs.length > 1 && (
                            <div style={PANEL_STYLES.legendRow}>
                                <span style={PANEL_STYLES.legendSharedSwatch} />
                                <span style={PANEL_STYLES.legendName}>shared between monarchies</span>
                                <span style={PANEL_STYLES.legendCount}>{sharedCount}</span>
                            </div>
                        )}
                    </div>
                )}

                {selectedMonarchs.length > 0 && (
                    <label style={{ ...PANEL_STYLES.connectionsRow, ...PANEL_STYLES.connections }}>
                        <input
                            type="checkbox"
                            checked={showSuccession}
                            onChange={(e) => onToggleSuccession(e.target.checked)}
                        />
                        <span
                            style={{
                                ...PANEL_STYLES.legendSwatch,
                                background: SUCCESSION_EDGE_COLOR,
                                width: 16,
                                height: 3,
                                borderRadius: 0,
                            }}
                        />
                        <span>Show succession</span>
                    </label>
                )}

                {selectedMonarchs.length > 1 && (
                    <div style={PANEL_STYLES.connections}>
                        <div style={PANEL_STYLES.connectionsTitle}>Connections</div>
                        <label style={PANEL_STYLES.connectionsRow}>
                            <span>Look back</span>
                            <input
                                type="range"
                                min={1}
                                max={MAX_BRIDGE_DEPTH}
                                step={1}
                                value={bridgeOptions.maxDepth}
                                onChange={(e) => updateBridge({ maxDepth: Number(e.target.value) })}
                                style={{ flex: 1 }}
                            />
                            <span style={PANEL_STYLES.depthValue}>
                                {bridgeOptions.maxDepth} gen
                            </span>
                        </label>
                        <label style={PANEL_STYLES.connectionsRow}>
                            <input
                                type="checkbox"
                                checked={bridgeOptions.includeSiblings}
                                onChange={(e) => updateBridge({ includeSiblings: e.target.checked })}
                            />
                            <span>Include siblings</span>
                        </label>
                        <div style={PANEL_STYLES.connectionsHint}>
                            Higher / siblings finds more links but adds more nodes.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

FilterPanel.propTypes = {
    selectedMonarchs: PropTypes.arrayOf(PropTypes.string).isRequired,
    monarchyOptions: PropTypes.arrayOf(PropTypes.string).isRequired,
    houseOptions: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
    })),
    memberCounts: PropTypes.arrayOf(PropTypes.number),
    sharedCount: PropTypes.number,
    bridgeOptions: PropTypes.shape({
        includeSiblings: PropTypes.bool,
        maxDepth: PropTypes.number,
    }),
    onBridgeChange: PropTypes.func,
    rankOptions: PropTypes.shape({
        visibleRanks: PropTypes.arrayOf(PropTypes.number),
    }),
    onRankChange: PropTypes.func,
    showSuccession: PropTypes.bool,
    onToggleSuccession: PropTypes.func,
    onChange: PropTypes.func.isRequired,
    embedded: PropTypes.bool,
};

FilterPanel.defaultProps = {
    houseOptions: [],
    memberCounts: [],
    sharedCount: 0,
    bridgeOptions: { includeSiblings: false, maxDepth: 2 },
    onBridgeChange: () => {},
    rankOptions: { visibleRanks: [6, 5, 4, 3] },
    onRankChange: () => {},
    showSuccession: true,
    onToggleSuccession: () => {},
    embedded: false,
};

export default React.memo(FilterPanel);