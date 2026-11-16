import { expect, test } from "./fixtures";

/* Wiring checks for the e2e setup. The real route smoke suite belongs to
   the website-testing-shell-e2e goal. */

test("home page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Makoa Martin" })).toBeVisible();
});

test("unknown route shows the not-found page", async ({ page }) => {
    await page.goto("/definitely-not-a-page");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page).toHaveTitle(/Page not found/);
});

test("requests outside localhost are aborted", async ({ page, blockedRequests }) => {
    await page.goto("/");
    const result = await page.evaluate(() =>
        fetch("https://example.com/").then(() => "loaded", () => "blocked")
    );
    expect(result).toBe("blocked");
    expect(blockedRequests).toContain("https://example.com/");
});
