import * as React from 'react';

const sectionTitle = { margin: "16px 0 6px", fontSize: 15, color: "#2f2f3a" };
const list = { margin: "0 0 0 2px", paddingLeft: 18 };
const li = { marginBottom: 4 };

function HelpPanel({ open, onOpen, onClose }) {
    React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) {
        return (
            <button
                onClick={onOpen}
                aria-label="Open help"
                title="How to use this chart"
                style={{
                    position: "absolute",
                    bottom: 20,
                    left: 20,
                    zIndex: 9999,
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    color: "#4a7fd6",
                    fontSize: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                }}
            >
                ?
            </button>
        );
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.55)",
                zIndex: 10000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: "#fff",
                    color: "#4a4a55",
                    maxWidth: 640,
                    width: "100%",
                    maxHeight: "85vh",
                    overflowY: "auto",
                    borderRadius: 8,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
                    padding: "20px 26px 26px",
                    fontSize: 13,
                    lineHeight: 1.55,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 20, color: "#2f2f3a" }}>Royal Family Trees — Guide</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close help"
                        style={{ border: "none", background: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "#6b6b76" }}
                    >
                        &times;
                    </button>
                </div>
                <p style={{ marginTop: 8, color: "#6b6b76" }}>
                    Explore royal genealogies reconstructed from Wikidata. Each node is a person; edges
                    are parent–child links. Pan by dragging the background and scroll or pinch to zoom.
                    Nothing is shown until you pick something to display.
                </p>

                <h3 style={sectionTitle}>Choosing what to show (top-left panel)</h3>
                <ul style={list}>
                    <li style={li}><strong>Monarchies</strong> — tick one or more (e.g. England, France, Spain). Selecting several overlays them so you can see where they connect.</li>
                    <li style={li}><strong>Houses</strong> — tick a family/house (e.g. Habsburg, Borjigin) to see its members instead of a single realm's succession.</li>
                    <li style={li}>You can mix monarchies and houses. Deselect everything to clear the chart.</li>
                </ul>

                <h3 style={sectionTitle}>Reading the colors</h3>
                <ul style={list}>
                    <li style={li}>Each selected monarchy/house gets its own hue; <strong>blue shades = male</strong>, <strong>red/pink shades = female</strong>.</li>
                    <li style={li}>People shared between two or more selections get a highlighted border, and the legend shows counts per selection plus the shared total.</li>
                    <li style={li}>Faded, grey-bordered nodes are connective ancestors added only to link members together, not members themselves.</li>
                </ul>

                <h3 style={sectionTitle}>Succession &amp; connections</h3>
                <ul style={list}>
                    <li style={li}><strong>Show succession</strong> — overlays gold arrows tracing how the crown passed from ruler to ruler (independent of bloodline).</li>
                    <li style={li}><strong>Connections</strong> (when 2+ are selected) — <em>Look back</em> sets how many generations to search for shared ancestors; <em>Include siblings</em> adds lateral links. More of either finds more connections but adds more nodes.</li>
                    <li style={li}><strong>Ranks to show</strong> (houses) — houses have hundreds of members, so only monarchs and nobles at the chosen ranks (default Duke and above) are drawn; the ancestors needed to connect them are added automatically.</li>
                </ul>

                <h3 style={sectionTitle}>Search &amp; stepping through people (top-right panel)</h3>
                <ul style={list}>
                    <li style={li}><strong>Search</strong> — type a name; pick a result to zoom to that person.</li>
                    <li style={li}><strong>Shared members</strong> — step through the people that connect the selected monarchies, zooming to each.</li>
                    <li style={li}><strong>Succession</strong> — step through rulers in order; with several monarchies selected each gets its own stepper.</li>
                </ul>

                <h3 style={sectionTitle}>Clicking &amp; hovering</h3>
                <ul style={list}>
                    <li style={li}><strong>Click a shared person</strong> to light up the shortest bloodline paths showing exactly how the dynasties link through them; click the background to clear.</li>
                    <li style={li}><strong>Hover</strong> any person for a detail box (bottom-right) with their dates and titles.</li>
                </ul>

                <p style={{ marginTop: 16, color: "#6b6b76", fontSize: 12 }}>
                    Data is imperfect: where Wikidata has no recorded parent, branches appear as separate
                    sub-trees rather than one connected family.
                </p>

                <div style={{ textAlign: "right", marginTop: 20 }}>
                    <button
                        onClick={onClose}
                        style={{
                            border: "none",
                            backgroundColor: "#4a7fd6",
                            color: "#fff",
                            padding: "8px 18px",
                            borderRadius: 4,
                            fontSize: 14,
                            cursor: "pointer",
                        }}
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}

export default React.memo(HelpPanel);
