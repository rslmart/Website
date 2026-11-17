import { expect, test, unexpectedConsoleErrors } from "./fixtures";

/* Site shell smoke (website-testing-shell-e2e). Runs in the desktop project
   (1440px) and the phone project (390px). Home and Bio have an h1 and a
   main. Hurricane, RoyalTree, Snow and Tectonics have neither; the shell
   names those with a visually hidden label only after client navigation, so
   the check there is the rendered page (map, graph or chart) plus a quiet
   console. */

function expectQuiet(consoleErrors, options) {
    expect(consoleErrors.pageErrors, consoleErrors.pageErrors.join("\n")).toEqual([]);
    const unexpected = unexpectedConsoleErrors(consoleErrors.messages, options);
    expect(unexpected.map((message) => message.text), unexpected.map((message) => message.text).join("\n")).toEqual([]);
}

const ROUTES = [
    {
        path: "/",
        heading: "Makoa Martin",
        ready: async (page) => {
            await expect(page.getByRole("main")).toBeVisible();
        },
    },
    {
        path: "/Bio",
        heading: "Russell Makoa Martin",
        ready: async (page) => {
            await expect(page.getByRole("main")).toBeVisible();
        },
    },
    {
        path: "/Hurricane",
        timeout: 90_000,
        map: true,
        ready: async (page) => {
            await expect(page.locator("#deckgl-overlay")).toBeVisible();
            await expect(page.getByText(/Loading global storm data/)).toHaveCount(0, { timeout: 60_000 });
            await expect(page.getByText(/Could not load storm data/)).toHaveCount(0);
        },
    },
    {
        path: "/RoyalTree",
        timeout: 90_000,
        ready: async (page) => {
            await expect(page.locator(".cytoscape-container")).toBeVisible();
            await expect(page.locator(".royal-tree-status")).toHaveCount(0, { timeout: 60_000 });
        },
    },
    {
        path: "/Snow",
        ready: async (page) => {
            await expect(page.getByText("WA Snowfall", { exact: true })).toBeVisible({ timeout: 30_000 });
            await expect(page.getByRole("alert")).toHaveCount(0);
        },
    },
    {
        path: "/Tectonics",
        timeout: 60_000,
        map: true,
        ready: async (page) => {
            await expect(page.locator("#deckgl-overlay")).toBeVisible();
            await expect(page.getByText(/Loading tectonic plate data/)).toHaveCount(0, { timeout: 30_000 });
            await expect(page.getByText(/Could not load tectonic data/)).toHaveCount(0);
        },
    },
];

test.beforeEach(({ page }, testInfo) => {
    const expected = testInfo.project.name === "phone" ? 390 : 1440;
    expect(page.viewportSize().width, testInfo.project.name).toBe(expected);
});

for (const route of ROUTES) {
    test(`${route.path} renders with no console errors`, async ({ page, consoleErrors, blockedRequests }) => {
        if (route.timeout) test.setTimeout(route.timeout);
        await page.goto(route.path);
        await route.ready(page);

        if (route.heading) {
            await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        }

        if (route.map) {
            await expect(page.locator(".mapboxgl-map")).toBeVisible();
            // Empty token: Mapbox throws before it requests tiles. The map shell
            // stays up, and no request carries a public pk. token.
            const withToken = blockedRequests.filter((url) => /access_token=pk\./.test(url));
            expect(withToken, "a public token was baked in").toEqual([]);
            const tokenErrors = consoleErrors.messages.filter((message) =>
                /API access token is required to use Mapbox GL/.test(message.text));
            expect(tokenErrors.length).toBeGreaterThan(0);
        }

        // Ignore the missing-token console error only on Hurricane and Tectonics.
        expectQuiet(consoleErrors, { allowMapboxToken: Boolean(route.map) });
    });
}

test("/does-not-exist shows the not-found page", async ({ page, consoleErrors }) => {
    await page.goto("/does-not-exist");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.getByText("/does-not-exist")).toBeVisible();
    await expect(page).toHaveTitle(/Page not found/);
    expectQuiet(consoleErrors);
});

test("/bio/ redirects to /Bio", async ({ page, consoleErrors }) => {
    await page.goto("/bio/");
    await expect(page).toHaveURL(/\/Bio$/);
    await expect(page.getByRole("heading", { level: 1, name: "Russell Makoa Martin" })).toBeVisible();
    expectQuiet(consoleErrors);
});

test("scrolled home opens a page at the top, and Back restores scroll and focus", async ({ page, consoleErrors }) => {
    const width = page.viewportSize().width;
    await page.setViewportSize({ width, height: 480 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Makoa Martin" })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(40);

    // DOM click, so Playwright does not scroll the card back into view first
    // and overwrite the position ScrollRestoration will save.
    await page.evaluate(() => {
        const link = [...document.querySelectorAll("a")].find((anchor) => /Resume/.test(anchor.textContent));
        link.click();
    });

    const bioHeading = page.getByRole("heading", { level: 1, name: "Russell Makoa Martin" });
    await expect(page).toHaveURL(/\/Bio$/);
    await expect(bioHeading).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(bioHeading).toBeFocused();

    await page.goBack();
    const homeHeading = page.getByRole("heading", { level: 1, name: "Makoa Martin" });
    await expect(page).toHaveURL(/\/$/);
    await expect(homeHeading).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrolled);
    await expect(homeHeading).toBeFocused();
    expectQuiet(consoleErrors);
});

test("manifest icons load", async ({ page, consoleErrors }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const manifestUrl = new URL(href, page.url());
    const manifestResponse = await page.request.get(manifestUrl.href);
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.icons?.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
        const iconUrl = new URL(icon.src, manifestUrl).href;
        const response = await page.request.get(iconUrl);
        expect(response.status(), iconUrl).toBe(200);
        expect((await response.body()).byteLength, iconUrl).toBeGreaterThan(32);
    }
    expectQuiet(consoleErrors);
});

async function mapboxChunkUrls(page, path, ready) {
    await page.goto(path);
    await ready(page);
    // Read the browser's resource list. A response listener can miss a chunk
    // that has already been evaluated by the time Playwright hears about it.
    const urls = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    return urls.filter((url) => /mapbox-gl/i.test(url));
}

test("/Snow and /Bio do not request mapbox chunks", async ({ page }) => {
    test.setTimeout(90_000);
    expect(await mapboxChunkUrls(page, "/Snow", (current) =>
        expect(current.getByText("WA Snowfall", { exact: true })).toBeVisible({ timeout: 30_000 }))).toEqual([]);

    expect(await mapboxChunkUrls(page, "/Bio", (current) =>
        expect(current.getByRole("heading", { level: 1, name: "Russell Makoa Martin" })).toBeVisible())).toEqual([]);

    // The same detector must see the library on a map page, or the two
    // checks above would pass even if they stopped looking. The built chunk
    // is assets/mapbox-gl-*.js.
    const hurricane = await mapboxChunkUrls(page, "/Hurricane", (current) =>
        expect(current.locator("#deckgl-overlay")).toBeVisible());
    expect(hurricane.length).toBeGreaterThan(0);
});
