import { expect, test } from "./fixtures";

/* Light/dark theme (website-site-theme-tokens-shell). */

test("the theme is set before React mounts (no flash)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    // Hold back the app bundle so React never mounts: whatever is on screen
    // now is what the first paint shows.
    await page.route(/\/assets\/index-[^/]+\.js$/, () => {});
    // A pending module script also holds back DOMContentLoaded, so don't
    // wait for it.
    await page.goto("/", { waitUntil: "commit" });

    await expect(page.locator("#root")).toBeEmpty();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 11, 11)");
});

test("the theme menu switches the theme and the choice survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Theme: System (light)" }).click();
    await page.getByRole("radio", { name: "Dark" }).check();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 11, 11)");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Theme: Dark" })).toBeVisible();

    // Back to following the system: the saved choice is removed.
    await page.getByRole("button", { name: "Theme: Dark" }).click();
    await page.getByRole("radio", { name: "System" }).check();
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
});

/* website-site-theme-page-chrome: the data pages follow the theme. */
for (const path of ["/Hurricane", "/RoyalTree", "/Snow", "/Tectonics"]) {
    test(`${path} renders in dark with the theme menu visible`, async ({ page }) => {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.emulateMedia({ colorScheme: "dark" });
        await page.goto(path);

        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await expect(page.getByRole("link", { name: /home/i })).toBeVisible();
        const menu = page.getByRole("button", { name: "Theme: System (dark)" });
        await expect(menu).toBeVisible();
        expect(errors).toEqual([]);

        // The menu doesn't overlap the Home button.
        const home = await page.getByRole("link", { name: /home/i }).boundingBox();
        const button = await menu.boundingBox();
        expect(button.x).toBeGreaterThanOrEqual(home.x + home.width);
    });
}

test("Bio stays light and hides the theme menu", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/Bio");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: /^Theme:/ })).toHaveCount(0);
});
