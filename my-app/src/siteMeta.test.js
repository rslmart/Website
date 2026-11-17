import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    ORIGIN,
    ROUTES,
    applyDocumentMeta,
    applySiteMetaBlock,
    canonicalUrl,
    routeByPath,
    siteMetaBlock,
} from "./siteMeta";

function metaBlock(html) {
    const match = html.match(/<!--site-meta-->[\s\S]*?<!--\/site-meta-->/);
    expect(match, "site-meta markers").toBeTruthy();
    return match[0].replace(/\s+/g, " ").trim();
}

describe("route metadata", () => {
    it("covers the six public routes and no others", () => {
        expect(ROUTES.map((route) => route.path)).toEqual([
            "/",
            "/Bio",
            "/Hurricane",
            "/RoyalTree",
            "/Snow",
            "/Tectonics",
        ]);
    });

    it("canonical URLs use the public origin", () => {
        expect(canonicalUrl("/")).toBe("https://makoa.link/");
        expect(canonicalUrl("/Bio")).toBe("https://makoa.link/Bio");
        for (const route of ROUTES) {
            expect(canonicalUrl(route.path).startsWith(`${ORIGIN}/`)).toBe(true);
        }
    });

    it("matches the path the router will see, ignoring case, slash, and query", () => {
        expect(routeByPath("/bio")?.path).toBe("/Bio");
        expect(routeByPath("/Bio/")?.path).toBe("/Bio");
        expect(routeByPath("/Snow?pass=snoqualmie#chart")?.path).toBe("/Snow");
        expect(routeByPath("/")).toBe(ROUTES[0]);
        expect(routeByPath("/nope")).toBeNull();
    });

    it("puts a distinct title, description, and canonical URL in each head block", () => {
        const titles = new Set();
        for (const route of ROUTES) {
            const block = siteMetaBlock(route);
            titles.add(route.title);
            expect(block).toContain(`<title>${route.title}</title>`);
            expect(block).toContain(`name="description" content="${route.description}"`);
            expect(block).toContain(`rel="canonical" href="${canonicalUrl(route.path)}"`);
            expect(block).toContain(`property="og:title" content="${route.title}"`);
            expect(block).toContain(`property="og:url" content="${canonicalUrl(route.path)}"`);
            expect(block).toContain(`property="og:image" content="${ORIGIN}/og.png"`);
            expect(block).toContain('name="twitter:card" content="summary_large_image"');
            expect(block).toContain(`name="twitter:title" content="${route.title}"`);
        }
        expect(titles.size).toBe(ROUTES.length);
    });

    it("escapes characters that would break the head block", () => {
        const block = siteMetaBlock({
            path: "/Bio",
            title: `Tom & <Jerry>`,
            description: `A "quote" & more`,
        });
        expect(block).toContain("<title>Tom &amp; &lt;Jerry&gt;</title>");
        expect(block).toContain('content="A &quot;quote&quot; &amp; more"');
        expect(block).not.toContain("<Jerry>");
    });

    it("replaces an existing block and refuses a shell that has none", () => {
        const shell = `<head>${siteMetaBlock(ROUTES[0])}</head>`;
        const next = applySiteMetaBlock(shell, ROUTES[1]);
        expect(next).toContain("<title>Resume · Makoa Martin</title>");
        expect(next).not.toContain("<title>Makoa Martin</title>");
        expect(() => applySiteMetaBlock("<head></head>", ROUTES[0])).toThrow(/site-meta/);
    });
});

describe("document head", () => {
    it("updates the live tags from a route", () => {
        const previous = document.head.innerHTML;
        document.head.innerHTML = siteMetaBlock(ROUTES[0]);
        applyDocumentMeta(ROUTES[1]);
        expect(document.title).toBe("Resume · Makoa Martin");
        expect(document.head.querySelector('meta[name="description"]').getAttribute("content")).toBe(ROUTES[1].description);
        expect(document.head.querySelector('link[rel="canonical"]').getAttribute("href")).toBe("https://makoa.link/Bio");
        expect(document.head.querySelector('meta[property="og:url"]').getAttribute("content")).toBe("https://makoa.link/Bio");
        expect(document.head.querySelector('meta[name="twitter:title"]').getAttribute("content")).toBe(ROUTES[1].title);
        document.head.innerHTML = previous;
    });
});

describe("shipped head files", () => {
    const indexHtml = readFileSync("index.html", "utf8");

    it("ships the home block and drops the CRA template leftovers", () => {
        expect(metaBlock(indexHtml)).toBe(metaBlock(siteMetaBlock(ROUTES[0])));
        expect(indexHtml).not.toContain("%PUBLIC_URL%");
        expect(indexHtml).not.toContain("/./");
        expect(indexHtml).not.toContain("This HTML file is a template");
        expect(indexHtml).not.toContain("web-app-manifest");
        expect(indexHtml).toContain('href="/favicon-32x32.png"');
        expect(indexHtml).toContain('href="/android-chrome-192x192.png"');
        expect(indexHtml).toContain('href="/manifest.json"');
    });

    it("lists the same six URLs in sitemap.xml and points robots.txt at it", () => {
        const sitemap = readFileSync("public/sitemap.xml", "utf8");
        const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
        expect(locs).toEqual(ROUTES.map((route) => canonicalUrl(route.path)));
        const robots = readFileSync("public/robots.txt", "utf8");
        expect(robots).toContain("Sitemap: https://makoa.link/sitemap.xml");
    });
});
