import * as React from 'react';

const SOURCES = [
    {
        label: "Storm tracks",
        name: "IBTrACS v04r01 — NOAA NCEI",
        href: "https://www.ncei.noaa.gov/products/international-best-track-archive",
    },
    {
        label: "Infrared imagery (1978–2015)",
        name: "HURSAT-B1 — NOAA NCEI",
        href: "https://www.ncei.noaa.gov/products/hurricane-satellite-data",
    },
    {
        label: "Infrared imagery (2016–present)",
        name: "RAMMB / CIRA TC Real-Time",
        href: "https://rammb-data.cira.colostate.edu/tc_realtime/",
    },
    {
        label: "Basemap",
        name: "Mapbox / OpenStreetMap",
        href: "https://www.mapbox.com/about/maps/",
    },
];

const linkStyle = {
    color: "#4a7fd6",
    textDecoration: "none",
};

function SourcesPanel({ open, toggle }) {
    if (!open) {
        return (
            <button
                onClick={toggle}
                style={{
                    position: "absolute",
                    bottom: 24,
                    right: 20,
                    zIndex: 9999,
                    fontSize: 12,
                    padding: "4px 10px",
                    backgroundColor: "#fff",
                    border: "none",
                    borderRadius: 4,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    color: "#6b6b76",
                    cursor: "pointer",
                }}
            >
                Data &amp; imagery sources
            </button>
        );
    }

    return (
        <div
            style={{
                position: "absolute",
                bottom: 24,
                right: 20,
                maxWidth: 300,
                zIndex: 9999,
                backgroundColor: "#fff",
                borderRadius: 4,
                boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                padding: "8px 12px",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#6b6b76",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>Data &amp; imagery sources</strong>
                <button
                    onClick={toggle}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#6b6b76", fontSize: 14 }}
                    aria-label="Close sources"
                >
                    &times;
                </button>
            </div>
            {SOURCES.map((source) => (
                <div key={source.name} style={{ marginBottom: 4 }}>
                    <div style={{ color: "#9b9ba6" }}>{source.label}</div>
                    <a href={source.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                        {source.name}
                    </a>
                </div>
            ))}
        </div>
    );
}

export default React.memo(SourcesPanel);
