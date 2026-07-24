import * as React from 'react';
import HelpModal, { helpSectionTitle as sectionTitle, helpList as list, helpListItem as li } from '../components/HelpModal';

function HelpPanel({ open, onOpen, onClose, fabPosition = { bottom: 20, left: 20 } }) {
    return (
        <HelpModal
            open={open}
            onOpen={onOpen}
            onClose={onClose}
            title="Royal Family Trees — Guide"
            fabPosition={fabPosition}
            fabTitle="How to use this chart"
        >
            <p style={{ marginTop: 8, color: "var(--color-text-muted)" }}>
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

            <p style={{ marginTop: 16, color: "var(--color-text-muted)", fontSize: 12 }}>
                Data is imperfect: where Wikidata has no recorded parent, branches appear as separate
                sub-trees rather than one connected family.
            </p>
        </HelpModal>
    );
}

export default React.memo(HelpPanel);
