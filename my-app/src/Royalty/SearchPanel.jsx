import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sm)",
    },
    dropdown: {
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        margin: "2px 0 0",
        padding: 0,
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-panel)",
        maxHeight: 240,
        overflowY: "auto",
        zIndex: 1002,
        listStyle: "none",
    },
    option: {
        padding: "6px 8px",
        fontSize: 14,
        cursor: "pointer",
        listStyle: "none",
    },
    dates: {
        display: "block",
        marginTop: 2,
        fontSize: 12,
        color: "var(--color-text-muted)",
    },
    clear: {
        position: "absolute",
        top: "50%",
        right: 4,
        transform: "translateY(-50%)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontSize: 12,
        lineHeight: 1.2,
        padding: "2px 6px",
        cursor: "pointer",
    },
    filter: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
        fontSize: 13,
        color: "var(--color-text)",
    },
    empty: {
        padding: "6px 8px",
        fontSize: 14,
        color: "var(--color-text-muted)",
    },
    sharedNav: {
        marginTop: 12,
        paddingTop: 10,
        borderTop: "1px solid var(--color-border)",
    },
    sharedHeaderRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12,
        color: "var(--color-text-muted)",
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
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontSize: 14,
        lineHeight: 1.4,
    },
    currentShared: {
        flex: 1,
        textAlign: "center",
        fontSize: 13,
        color: "var(--color-text)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
};

// A single monarchy's succession walk. Each instance keeps its own position so
// several dynasties can be stepped through independently, resetting when its
// monarch list changes (i.e. a new selection).
function MonarchStepper({ title, monarchs, onZoomTo, activeId = null }) {
    const [index, setIndex] = useState(0);
    const listKey = monarchs.map((monarch) => monarch.id).join('\n');

    useEffect(() => {
        setIndex(0);
    }, [listKey]);

    // A bar click or a graph selection moves this stepper when the person is
    // in the list. It does not zoom again; the page already did.
    useEffect(() => {
        if (!activeId) return;
        const next = monarchs.findIndex((monarch) => monarch.id === activeId);
        if (next >= 0) setIndex(next);
    }, [activeId, listKey, monarchs]);

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
    activeId: PropTypes.string,
};

function SearchPanel({ people, sharedPeople, monarchOrder, onZoomTo, embedded, activeId }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [monarchsOnly, setMonarchsOnly] = useState(false);
    const [sharedIndex, setSharedIndex] = useState(0);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);
    const listId = useId();
    const emptyId = useId();

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return people
            .filter(p => p.label.toLowerCase().includes(q))
            .filter(p => !monarchsOnly || p.monarch)
            .slice(0, MAX_RESULTS);
    }, [query, people, monarchsOnly]);

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

    const clearSearch = () => {
        setQuery('');
        setOpen(false);
        setActiveIndex(0);
        inputRef.current?.focus();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            setOpen(false);
            return;
        }
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
        }
    };

    const trimmed = query.trim();
    const showList = open && matches.length > 0;
    const showEmpty = open && trimmed.length > 0 && matches.length === 0;
    const activeOptionId = showList ? `${listId}-opt-${activeIndex}` : undefined;

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
        <div
            className={embedded ? undefined : "control-panel"}
            style={embedded ? undefined : { marginBottom: 10, zIndex: 1003 }}
        >
            <div ref={wrapRef}>
            <label style={STYLES.filter}>
                <input
                    type="checkbox"
                    checked={monarchsOnly}
                    onChange={(e) => {
                        setMonarchsOnly(e.target.checked);
                        setActiveIndex(0);
                        if (query.trim()) setOpen(true);
                    }}
                />
                Monarchs only
            </label>
            <div style={STYLES.searchWrap}>
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showList || showEmpty}
                    aria-controls={showList ? listId : (showEmpty ? emptyId : undefined)}
                    aria-activedescendant={activeOptionId}
                    aria-label="Search for a person"
                    style={{ ...STYLES.input, paddingRight: query ? 64 : 8 }}
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
                {query && (
                    <button
                        type="button"
                        style={STYLES.clear}
                        onClick={clearSearch}
                        aria-label="Clear search"
                    >
                        Clear
                    </button>
                )}
                {showList && (
                    <ul role="listbox" id={listId} aria-label="Search results" style={STYLES.dropdown}>
                        {matches.map((person, idx) => (
                            <li
                                key={person.id}
                                id={`${listId}-opt-${idx}`}
                                role="option"
                                aria-selected={idx === activeIndex}
                                style={{
                                    ...STYLES.option,
                                    background: idx === activeIndex ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                                }}
                                onMouseEnter={() => setActiveIndex(idx)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectMatch(person);
                                }}
                            >
                                {person.label}
                                {person.dates ? <span style={STYLES.dates}>{person.dates}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}
                {showEmpty && (
                    <div id={emptyId} role="status" style={{ ...STYLES.dropdown, ...STYLES.empty }}>
                        No results
                    </div>
                )}
            </div>
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
                    activeId={activeId}
                />
            ))}
        </div>
    );
}

SearchPanel.propTypes = {
    people: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        dates: PropTypes.string,
        monarch: PropTypes.bool,
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
    embedded: PropTypes.bool,
    activeId: PropTypes.string,
};

SearchPanel.defaultProps = {
    monarchOrder: [],
    embedded: false,
    activeId: null,
};

export default React.memo(SearchPanel);
