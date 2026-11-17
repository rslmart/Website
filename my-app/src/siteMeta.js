/* Per-route document titles and share tags. The build copies this block
   into each route's HTML shell (see routeHtmlPlugin in vite.config.js) so
   link previewers see it without running the client bundle. RootLayout
   applies the same values after a client-side navigation. */

export const ORIGIN = "https://makoa.link";

export const ROUTES = [
    {
        path: "/",
        title: "Makoa Martin",
        description: "A collection of interactive data-visualization projects — plus a resume.",
    },
    {
        path: "/Bio",
        title: "Resume · Makoa Martin",
        description: "Russell Makoa Martin's resume: background, experience, skills, and projects.",
    },
    {
        path: "/Hurricane",
        title: "Hurricane explorer · Makoa Martin",
        description: "Every tropical cyclone on record (1842–present) on an interactive map, with tracks and satellite imagery.",
    },
    {
        path: "/RoyalTree",
        title: "Royal family tree · Makoa Martin",
        description: "Interactive royal genealogies reconstructed from Wikidata — see how dynasties connect.",
    },
    {
        path: "/Snow",
        title: "Washington snowfall · Makoa Martin",
        description: "Washington mountain-pass snowfall by season, with ENSO (El Niño / La Niña) context.",
    },
    {
        path: "/Tectonics",
        title: "Tectonic plates · Makoa Martin",
        description: "Global plate boundaries, orogens, and plate velocities rendered on a 3D map.",
    },
];

export function canonicalUrl(path) {
    return path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`;
}

export function routeByPath(input) {
    if (!input) return null;
    const pathname = String(input).split(/[?#]/, 1)[0];
    const normalized = pathname.replace(/\/+$/, "") || "/";
    const lower = normalized.toLowerCase();
    return ROUTES.find((route) => route.path.toLowerCase() === lower) ?? null;
}

function escapeText(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value) {
    return escapeText(value).replace(/"/g, "&quot;");
}

export function siteMetaBlock(route) {
    const title = escapeText(route.title);
    const description = escapeAttr(route.description);
    const url = escapeAttr(canonicalUrl(route.path));
    const image = escapeAttr(`${ORIGIN}/og.png`);
    return `<!--site-meta-->
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Makoa's Website" />
    <meta property="og:title" content="${escapeAttr(route.title)}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Makoa's Website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(route.title)}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <!--/site-meta-->`;
}

const META_BLOCK = /<!--site-meta-->[\s\S]*?<!--\/site-meta-->/;

export function applySiteMetaBlock(html, route) {
    if (!META_BLOCK.test(html)) {
        throw new Error("index.html is missing <!--site-meta--> markers");
    }
    return html.replace(META_BLOCK, siteMetaBlock(route));
}

function setMetaContent(attr, key, content) {
    const el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (el) el.setAttribute("content", content);
}

export function applyDocumentMeta(route) {
    document.title = route.title;
    setMetaContent("name", "description", route.description);
    setMetaContent("property", "og:title", route.title);
    setMetaContent("property", "og:description", route.description);
    setMetaContent("property", "og:url", canonicalUrl(route.path));
    setMetaContent("name", "twitter:title", route.title);
    setMetaContent("name", "twitter:description", route.description);
    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", canonicalUrl(route.path));
}
