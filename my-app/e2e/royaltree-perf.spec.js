import { test, expect } from "./fixtures.js";

/* RoyalTree on large selections: layout runs in a worker, a node cap asks
   before very large views, and the succession toggle doesn't re-lay out.
   Desktop only: the phone layout puts the same controls in a drawer. */

const NINE = ["England", "France", "Germany", "Austria", "Spain", "Holy Roman Empire", "Bavaria", "Bohemia", "Hungary"];

const graphReady = (page) =>
    page.waitForFunction(() => {
        const c = document.querySelector(".cytoscape-container");
        return c && c._cyreg && c._cyreg.cy && c._cyreg.cy.nodes().length > 0
            && !document.querySelector(".royal-tree-status");
    }, null, { timeout: 60_000, polling: 100 });

const nodeCount = (page) =>
    page.evaluate(() => document.querySelector(".cytoscape-container")._cyreg.cy.nodes().length);

// Draw-list probe: records, every ~100ms and after every frame Cytoscape
// draws, how many elements the renderer's draw list holds, how many the graph
// holds, and whether the canvas is visible (it is hidden while a view is
// swapped in).
const startDrawProbe = (page) =>
    page.evaluate(() => {
        const container = document.querySelector(".cytoscape-container");
        const cy = container._cyreg.cy;
        const r = cy.renderer();
        const samples = (window.__drawSamples = []);
        const sample = (kind) => samples.push({
            kind,
            drawn: r.getCachedZSortedEles().length,
            total: cy.elements().length,
            visible: getComputedStyle(container).visibility !== "hidden",
        });
        const render = r.render;
        r.render = function (...args) {
            const out = render.apply(this, args);
            sample("frame");
            return out;
        };
        window.__drawTimer = setInterval(() => sample("tick"), 100);
        return r.getCachedZSortedEles().length;
    });

const stopDrawProbe = (page) =>
    page.evaluate(() => {
        clearInterval(window.__drawTimer);
        const cy = document.querySelector(".cytoscape-container")._cyreg.cy;
        return { samples: window.__drawSamples, drawn: cy.renderer().getCachedZSortedEles().length, total: cy.elements().length };
    });

const positions = (page) =>
    page.evaluate(() => document.querySelector(".cytoscape-container")._cyreg.cy.nodes()
        .map((n) => `${n.id()}:${Math.round(n.position("x"))},${Math.round(n.position("y"))}`).join("|"));

test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop controls");
    await page.addInitScript(() => {
        try { window.localStorage.setItem("royaltyHelpSeen", "1"); } catch (e) { /* ignore */ }
    });
});

test("large views ask first, and the succession toggle keeps the layout", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/RoyalTree");
    await graphReady(page);

    for (const name of NINE.slice(1)) {
        await page.getByRole("checkbox", { name, exact: true }).first().check();
        await graphReady(page);
    }
    const slider = page.locator("input[type=range]").first();
    const atDefault = await nodeCount(page);

    // Over the cap: a modal warning focused on Cancel; Escape cancels, puts
    // the look-back back and returns focus to the slider.
    await slider.focus();
    await slider.fill("5");
    const warning = page.getByRole("dialog", { name: /Show 2,\d{3} people\?/ });
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute("aria-modal", "true");
    await expect(warning.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(warning).toBeHidden();
    await expect(slider).toHaveValue("2");
    await expect(slider).toBeFocused();
    expect(await nodeCount(page)).toBe(atDefault);

    // Continue: the large view is laid out, and the canvas never shows a
    // partial graph on the way (the old view stays drawn until the swap).
    await slider.fill("5");
    const oldDrawn = await startDrawProbe(page);
    await warning.getByRole("button", { name: "Show all" }).click();
    await graphReady(page);
    await page.waitForTimeout(300);
    const probe = await stopDrawProbe(page);
    expect(probe.total).toBeGreaterThan(oldDrawn);
    expect(probe.drawn).toBe(probe.total); // the draw list covers every element
    const frames = probe.samples.filter((s) => s.kind === "frame");
    expect(frames.length).toBeGreaterThan(0);
    // Every visible sample shows either the whole old view or the whole new one.
    const visible = probe.samples.filter((s) => s.visible);
    expect(visible.some((s) => s.drawn === probe.total)).toBe(true);
    for (const s of visible) expect([oldDrawn, probe.total]).toContain(s.drawn);
    expect(await nodeCount(page)).toBeGreaterThan(atDefault);

    // Toggling succession only adds/removes the overlay edges.
    const before = await positions(page);
    const succession = page.getByRole("checkbox", { name: /succession/i }).first();
    await succession.uncheck();
    expect(await page.evaluate(() => document.querySelector(".cytoscape-container")._cyreg.cy
        .edges('[relation = "succession"]').length)).toBe(0);
    await succession.check();
    expect(await page.evaluate(() => document.querySelector(".cytoscape-container")._cyreg.cy
        .edges('[relation = "succession"]').length)).toBeGreaterThan(0);
    expect(await positions(page)).toBe(before);
});

test("the page stays responsive while a large view is laid out", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/RoyalTree");
    await graphReady(page);
    for (const name of NINE.slice(1, 5)) {
        await page.getByRole("checkbox", { name, exact: true }).first().check();
    }
    // While the worker lays out, the main thread still answers quickly.
    const lag = await page.evaluate(() => new Promise((resolve) => {
        const t = performance.now();
        setTimeout(() => resolve(performance.now() - t), 0);
    }));
    expect(lag).toBeLessThan(500);
    await graphReady(page);
    expect(await nodeCount(page)).toBeGreaterThan(300);
});

test("cancelling the warning drops a render that was still in flight", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/RoyalTree");
    await graphReady(page);
    for (const name of NINE.slice(1)) {
        await page.getByRole("checkbox", { name, exact: true }).first().check();
        await graphReady(page);
    }
    const slider = page.locator("input[type=range]").first();
    const atDefault = await nodeCount(page);
    const before = await positions(page);

    // Look-back 3 is just under the cap and starts laying out; 5 is over it.
    await slider.fill("3");
    await slider.fill("5");
    const warning = page.getByRole("dialog");
    await warning.getByRole("button", { name: "Cancel" }).click();
    await expect(slider).toHaveValue("2");

    // Whatever was in flight never lands: the graph settles back on look-back 2.
    await page.waitForTimeout(4000);
    await graphReady(page);
    expect(await nodeCount(page)).toBe(atDefault);
    expect(await positions(page)).toBe(before);
    await expect(slider).toHaveValue("2");
});
