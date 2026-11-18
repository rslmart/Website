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
                The chart opens on England. Circles are people, reconstructed from Wikidata.
                A small dot is a marriage: the lines into it are the spouses, and the line out
                of it is their child. When only one parent is on the chart, the line runs
                straight from that parent to the child. A sibling line is drawn only when two
                people do not already share a parent on the chart. Gold arrows, while Show
                succession is on, trace the crown from ruler to ruler. They are not blood
                relationships. Pan by dragging the background and scroll or pinch to zoom.
                The zoom buttons, or the keys + − and F, zoom in, zoom out and fit. The fit keeps
                monarch names readable. The chip at the top names the trees on screen.
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
                <li style={li}><strong>Show succession</strong> — overlays gold arrows tracing how the crown passed from ruler to ruler (independent of bloodline). The arrows stay on until this box is cleared, and hiding them does not move the tree.</li>
                <li style={li}><strong>Reigns</strong> — the strip above the tree has one lane per selected monarchy. A bar’s colour is that ruler’s dynasty, and the outline separates neighbouring reigns. A dashed mark is a ruler whose reign years are not in the data. Click a bar to zoom to that ruler. It starts open on a wide screen and closed on a narrow one; the button opens and closes it.</li>
                <li style={li}><strong>Connections</strong> (when 2+ are selected) — <em>Look back</em> sets how many generations to search for shared ancestors; <em>Include siblings</em> adds lateral links. More of either finds more connections but adds more nodes.</li>
                <li style={li}><strong>Ranks to show</strong> (houses) — houses have hundreds of members, so only monarchs and nobles at the chosen ranks (default Duke and above) are drawn; the ancestors needed to connect them are added automatically.</li>
            </ul>

            <h3 style={sectionTitle}>Search &amp; stepping through people (top-right panel)</h3>
            <ul style={list}>
                <li style={li}><strong>Search</strong> — type a name. Each result shows birth and death years. Monarchs only limits the list to rulers. Clear empties the box. If nothing matches, the list says No results. Pick a result to zoom to that person.</li>
                <li style={li}><strong>Shared members</strong> — step through the people that connect the selected monarchies, zooming to each.</li>
                <li style={li}><strong>Succession</strong> — step through rulers in order; with several monarchies selected each gets its own stepper.</li>
            </ul>

            <h3 style={sectionTitle}>Clicking &amp; hovering</h3>
            <ul style={list}>
                <li style={li}><strong>Tap or click a person</strong> for their details. On a phone the sheet uses at most the bottom 45% of the screen, and the person stays in view. Hover a person on a desktop for the same box.</li>
                <li style={li}><strong>Focus</strong>, in that details box, draws their hourglass: ancestors above, descendants below, spouses beside them. The steppers change the depth, +k adds the hidden relatives it counts, and Back returns to the full tree at the zoom you left.</li>
                <li style={li}><strong>Click a shared person</strong> to light up the shortest bloodline paths showing exactly how the dynasties link through them; click the background to clear.</li>
                <li style={li}><strong>Monarchs</strong> are larger ellipses marked with ♔ and their reign years. Portraits show at every zoom. Zoom in for full dates and relatives. House names on the lines appear when zoomed in, or when you hover a line, and they stay in the person's details.</li>
            </ul>

            <p style={{ marginTop: 16, color: "var(--color-text-muted)", fontSize: 12 }}>
                Data is imperfect: where Wikidata has no recorded parent, branches appear as separate
                sub-trees rather than one connected family.
            </p>
        </HelpModal>
    );
}

export default React.memo(HelpPanel);
