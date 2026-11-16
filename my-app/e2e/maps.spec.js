import { expect, test } from "./fixtures";

/* website-site-theme-maps-charts: the Mapbox wordmark and attribution sit
   above the deck.gl canvas and take clicks. Tests have no Mapbox token, so
   Mapbox never adds its controls; a probe link placed in each control corner
   stands in for them. The deck.gl canvas must still be the top layer over
   the rest of the map, or map interaction would break. */
for (const path of ["/Hurricane", "/Tectonics"]) {
    test(`${path}: map controls are clickable above deck.gl`, async ({ page, isMobile }) => {
        await page.goto(path);
        await page.locator("#deckgl-overlay").waitFor();
        await page.locator(".mapboxgl-ctrl-bottom-right").waitFor({ state: "attached" });
        // Hurricane opens its help on a first visit.
        await page.keyboard.press("Escape");
        await expect(page.locator(".modal-overlay")).toHaveCount(0);

        // On phones the attribution moves to bottom-left beside the wordmark,
        // because the Controls button covers bottom-right.
        const corners = isMobile ? ["bottom-left"] : ["bottom-left", "bottom-right"];
        const hits = await page.evaluate((cornerNames) => {
            const result = {};
            for (const corner of cornerNames) {
                const probe = document.createElement("a");
                probe.href = "#probe";
                probe.className = "mapboxgl-ctrl";
                probe.textContent = "probe";
                probe.style.cssText = "display:block;padding:4px";
                document.querySelector(`.mapboxgl-ctrl-${corner}`).appendChild(probe);
                const r = probe.getBoundingClientRect();
                result[corner] = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === probe;
                probe.remove();
            }
            const canvas = document.querySelector("#deckgl-overlay").getBoundingClientRect();
            result.centre = document.elementFromPoint(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.6)?.id;
            return result;
        }, corners);

        expect(hits).toEqual({ ...Object.fromEntries(corners.map((c) => [c, true])), centre: "deckgl-overlay" });
    });
}
