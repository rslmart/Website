import React from "react";

/* Recharts itself renders SVG fine in jsdom; only ResponsiveContainer needs a
   measured parent (jsdom has no layout), so it is replaced with a fixed-size
   one. Every other Recharts export stays real (see setup.js). */
export const MOCK_CHART_SIZE = { width: 800, height: 400 };

export function ResponsiveContainer({ children }) {
    const chart = typeof children === "function" ? children(MOCK_CHART_SIZE) : children;
    return (
        <div className="recharts-responsive-container" style={MOCK_CHART_SIZE}>
            {React.isValidElement(chart) ? React.cloneElement(chart, MOCK_CHART_SIZE) : chart}
        </div>
    );
}
