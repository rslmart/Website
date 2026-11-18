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
        label: "Infrared map frames (GridSat-B1)",
        name: "Knapp and coauthors, 2011, doi:10.1175/2011BAMS3039.1; dataset doi:10.7289/V59P2ZKR",
        href: "https://doi.org/10.7289/V59P2ZKR",
    },
    {
        label: "Basemap",
        name: "Mapbox / OpenStreetMap",
        href: "https://www.mapbox.com/about/maps/",
    },
];

const linkStyle = {
    color: "var(--color-primary)",
    textDecoration: "none",
};

function DataThrough({ dataThrough }) {
    if (!dataThrough) {
        return null;
    }
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{ color: "var(--color-text-faint)" }}>Data through</div>
            <div>{dataThrough}</div>
        </div>
    );
}

function SourcesPanel({ open, toggle, embedded, dataThrough }) {
    if (embedded) {
        return (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-muted)" }}>
                <DataThrough dataThrough={dataThrough} />
                {SOURCES.map((source) => (
                    <div key={source.name} style={{ marginBottom: 6 }}>
                        <div style={{ color: "var(--color-text-faint)" }}>{source.label}</div>
                        <a href={source.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                            {source.name}
                        </a>
                    </div>
                ))}
            </div>
        );
    }

    if (!open) {
        return (
            <button
                onClick={toggle}
                aria-expanded="false"
                style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    backgroundColor: "var(--color-surface)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    boxShadow: "var(--shadow-panel)",
                    color: "var(--color-text-muted)",
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
                maxWidth: 300,
                backgroundColor: "var(--color-surface)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-panel)",
                padding: "8px 12px",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--color-text-muted)",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>Data &amp; imagery sources</strong>
                <button
                    onClick={toggle}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 14 }}
                    aria-label="Close sources"
                >
                    &times;
                </button>
            </div>
            <DataThrough dataThrough={dataThrough} />
            {SOURCES.map((source) => (
                <div key={source.name} style={{ marginBottom: 4 }}>
                    <div style={{ color: "var(--color-text-faint)" }}>{source.label}</div>
                    <a href={source.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                        {source.name}
                    </a>
                </div>
            ))}
        </div>
    );
}

export default React.memo(SourcesPanel);
