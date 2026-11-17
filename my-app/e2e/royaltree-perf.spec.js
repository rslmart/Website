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

    // Over the cap: a warning, and Cancel puts the look-back back.
    await slider.fill("5");
    const warning = page.getByRole("alertdialog");
    await expect(warning).toContainText(/Show 2,\d{3} people\?/);
    await warning.getByRole("button", { name: "Cancel" }).click();
    await expect(warning).toBeHidden();
    await expect(slider).toHaveValue("2");
    expect(await nodeCount(page)).toBe(atDefault);

    // Continue: the large view is laid out.
    await slider.fill("5");
    await warning.getByRole("button", { name: "Show all" }).click();
    await graphReady(page);
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
