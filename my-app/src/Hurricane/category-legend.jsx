import * as React from "react";
import { MISSING_WIND_COLOR, MISSING_WIND_LABEL, WIND_CATEGORIES } from "./trackSemantics";

// Sits under the home, theme, and help buttons (those fabs end near 56px)
// and stays left of the desktop filter column. On a phone the filter column
// is not on the map, so the legend may use the width.
export function categoryLegendStyle(isMobile) {
    return {
        position: "absolute",
        top: "calc(64px + env(safe-area-inset-top, 0px))",
        left: 12,
        zIndex: 9998,
        maxWidth: isMobile ? "calc(100vw - 24px)" : "calc(100vw - 400px)",
        boxSizing: "border-box",
        backgroundColor: "var(--color-surface)",
        boxShadow: "var(--shadow-panel)",
        borderRadius: "var(--radius-sm)",
        padding: "6px 8px",
        color: "var(--color-text-muted)",
        fontSize: 12,
        lineHeight: 1.3,
        pointerEvents: "none",
    };
}

const listStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 10px",
    listStyle: "none",
    margin: 0,
    padding: 0,
};

const itemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
};

function swatchStyle(color) {
    return {
        width: 12,
        height: 12,
        flex: "0 0 auto",
        borderRadius: 2,
        backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
        border: "1px solid var(--color-border-strong)",
        boxSizing: "border-box",
    };
}

function Swatch({ color, label }) {
    return (
        <li style={itemStyle}>
            <span aria-hidden="true" style={swatchStyle(color)} />
            <span>{label}</span>
        </li>
    );
}

function CategoryLegend({ isMobile = false }) {
    return (
        <div role="region" aria-label="Wind category legend" style={categoryLegendStyle(isMobile)}>
            <ul style={listStyle}>
                {WIND_CATEGORIES.map((entry) => (
                    <Swatch key={entry.label} color={entry.color} label={entry.label} />
                ))}
                <Swatch color={MISSING_WIND_COLOR} label={MISSING_WIND_LABEL} />
            </ul>
        </div>
    );
}

export default React.memo(CategoryLegend);
