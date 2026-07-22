import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './RoyalTreeStyle.css';

const MAX_RESULTS = 10;

const STYLES = {
    searchWrap: {
        position: "relative",
    },
    input: {
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 8px",
        fontSize: 14,
        border: "1px solid #ccc",
        borderRadius: 4,
    },
    dropdown: {
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        marginTop: 2,
        background: "white",
        border: "1px solid #ccc",
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        maxHeight: 240,
        overflowY: "auto",
        zIndex: 1002,
    },
    option: {
        padding: "6px 8px",
        fontSize: 14,
        cursor: "pointer",
    },
    sharedNav: {
        marginTop: 12,
        paddingTop: 10,
        borderTop: "1px solid #eee",
    },
    sharedHeaderRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12,
        color: "#7f8c8d",
        marginBottom: 6,
    },
    sharedControls: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    stepButton: {
        padding: "2px 10px",
        cursor: "pointer",
        border: "1px solid #ccc",
        borderRadius: 4,
        background: "#f7f7f7",
        fontSize: 14,
        lineHeight: 1.4,
    },
    currentShared: {
        flex: 1,
        textAlign: "center",
        fontSize: 13,
        color: "#2c3e50",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
};

// A single monarchy's succession walk. Each instance keeps its own position so
// several dynasties can be stepped through independently, resetting when its
// monarch list changes (i.e. a new selection).
function MonarchStepper({ title, monarchs, onZoomTo }) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [monarchs]);

    if (!monarchs.length) return null;

    const step = (delta) => {
        const next = (index + delta + monarchs.length) % monarchs.length;
        setIndex(next);
        onZoomTo(monarchs[next].id);
    };
    const current = monarchs[index];

    return (
        <div style={STYLES.sharedNav}>
            <div style={STYLES.sharedHeaderRow}>
                <span>{title}</span>
                <span>{index + 1} of {monarchs.length}</span>
            </div>
            <div style={STYLES.sharedControls}>
                <button
                    type="button"
                    style={STYLES.stepButton}
                    onClick={() => step(-1)}
                    aria-label="Previous monarch"
                >
                    ‹
                </button>
                <span
                    style={STYLES.currentShared}
                    title={current.label}
                    onClick={() => onZoomTo(current.id)}
                >
                    {current.label}
                </span>
                <button
                    type="button"
                    style={STYLES.stepButton}
                    onClick={() => step(1)}
                    aria-label="Next monarch"
                >
                    ›
                </button>
            </div>
        </div>
    );
}

MonarchStepper.propTypes = {
    title: PropTypes.string.isRequired,
    monarchs: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
    })).isRequired,
    onZoomTo: PropTypes.func.isRequired,
};

function SearchPanel({ people, sharedPeople, monarchOrder, onZoomTo }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [sharedIndex, setSharedIndex] = useState(0);
    const wrapRef = useRef(null);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return people
            .filter(p => p.label.toLowerCase().includes(q))
            .slice(0, MAX_RESULTS);
    }, [query, people]);

    // Reset the shared stepper whenever the selection changes.
    useEffect(() => {
        setSharedIndex(0);
    }, [sharedPeople]);

    // Close the dropdown when clicking outside the search box.
    useEffect(() => {
        const onDocClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selectMatch = (person) => {
        setQuery(person.label);
        setOpen(false);
        onZoomTo(person.id);
    };

    const onKeyDown = (e) => {
        if (!open || matches.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, matches.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectMatch(matches[activeIndex] || matches[0]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const hasShared = sharedPeople.length > 0;
    const stepShared = (delta) => {
        if (!hasShared) return;
        const next = (sharedIndex + delta + sharedPeople.length) % sharedPeople.length;
        setSharedIndex(next);
        onZoomTo(sharedPeople[next].id);
    };
    const currentShared = hasShared ? sharedPeople[sharedIndex] : null;

    // One stepper per monarchy so each dynasty's succession can be walked
    // independently; a single selection just reads "Succession".
    const multiMonarchy = monarchOrder.length > 1;

    return (
        <div className="control-panel" style={{ marginBottom: 10, zIndex: 1003 }}>
            <div style={STYLES.searchWrap} ref={wrapRef}>
                <input
                    type="text"
                    style={STYLES.input}
                    placeholder="Search for a person…"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onFocus={() => query && setOpen(true)}
                    onKeyDown={onKeyDown}
                />
                {open && matches.length > 0 && (
                    <div style={STYLES.dropdown}>
                        {matches.map((person, idx) => (
                            <div
                                key={person.id}
                                style={{
                                    ...STYLES.option,
                                    background: idx === activeIndex ? '#eef3fb' : 'white',
                                }}
                                onMouseEnter={() => setActiveIndex(idx)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectMatch(person);
                                }}
                            >
                                {person.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {hasShared && (
                <div style={STYLES.sharedNav}>
                    <div style={STYLES.sharedHeaderRow}>
                        <span>Shared members</span>
                        <span>{sharedIndex + 1} of {sharedPeople.length}</span>
                    </div>
                    <div style={STYLES.sharedControls}>
                        <button
                            type="button"
                            style={STYLES.stepButton}
                            onClick={() => stepShared(-1)}
                            aria-label="Previous shared member"
                        >
                            ‹
                        </button>
                        <span
                            style={STYLES.currentShared}
                            title={currentShared ? currentShared.label : ''}
                            onClick={() => currentShared && onZoomTo(currentShared.id)}
                        >
                            {currentShared ? currentShared.label : ''}
                        </span>
                        <button
                            type="button"
                            style={STYLES.stepButton}
                            onClick={() => stepShared(1)}
                            aria-label="Next shared member"
                        >
                            ›
                        </button>
                    </div>
                </div>
            )}

            {monarchOrder.map(({ monarchy, monarchs }) => (
                <MonarchStepper
                    key={monarchy}
                    title={multiMonarchy ? monarchy.replace(/_/g, ' ') : 'Succession'}
                    monarchs={monarchs}
                    onZoomTo={onZoomTo}
                />
            ))}
        </div>
    );
}

SearchPanel.propTypes = {
    people: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
    })).isRequired,
    sharedPeople: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
    })).isRequired,
    monarchOrder: PropTypes.arrayOf(PropTypes.shape({
        monarchy: PropTypes.string.isRequired,
        monarchs: PropTypes.arrayOf(PropTypes.shape({
            id: PropTypes.string.isRequired,
            label: PropTypes.string.isRequired,
        })).isRequired,
    })),
    onZoomTo: PropTypes.func.isRequired,
};

SearchPanel.defaultProps = {
    monarchOrder: [],
};

export default React.memo(SearchPanel);
