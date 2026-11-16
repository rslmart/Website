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

test("the toggle switches the theme and the choice survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 11, 11)");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
});
