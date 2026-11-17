import { defineConfig, devices } from "@playwright/test";

/* Browser smoke tests (`npm run test:e2e`) against `vite preview` of a
   production build. The build goes to its own BUILD_PATH, never build/, so
   `deploy.sh --skip-build` can't ship this token-less build. A fixed port
   with --strictPort fails fast instead of drifting onto another worktree's
   server; override it with PORT=... */
const PORT = Number(process.env.PORT || 4317);
const BUILD_PATH = "build-e2e";
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    outputDir: "test-results",
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
    use: {
        baseURL,
        serviceWorkers: "block",
        trace: "retain-on-failure",
        // Light is pinned so a dark system theme cannot move these tests.
        colorScheme: "light",
    },
    projects: [
        // Widths are the shell-smoke sizes. Phone keeps Pixel 7's touch/mobile
        // flags so the data pages take their phone layout; only the viewport changes.
        {
            name: "desktop",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
        },
        {
            name: "phone",
            use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
        },
    ],
    webServer: {
        command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "ignore",
        env: {
            BUILD_PATH,
            // Map pages are tested in their no-token state, whatever
            // .env.local or the shell holds (process env beats .env files).
            VITE_MAPBOX_TOKEN: "",
            BROWSER: "none",
        },
    },
});
