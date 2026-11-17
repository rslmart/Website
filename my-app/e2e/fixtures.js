import { test as base, expect } from "@playwright/test";

/* Offline guard for every e2e test: requests to anything but the local
   preview server are aborted (fonts, map tiles, analytics...). Portrait
   images under /monarchy/ and /hurricane-ir/ are stubbed with a 1×1 PNG
   instead, so a missing portrait is not a console error. Tests can read
   what was blocked from the `blockedRequests` fixture (stubbed URLs are
   on `blockedRequests.stubbed`). Console errors and uncaught exceptions
   are collected on `consoleErrors`. Import `test` and `expect` from this
   file, not from @playwright/test. */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Smallest valid PNG. Content-Type matches the bytes; the URL may say .jpg.
const STUB_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);

function isLocal(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "data:" || protocol === "blob:" || LOCAL_HOSTS.has(hostname);
    } catch {
        return false;
    }
}

function isStubbedImage(url) {
    try {
        const { pathname } = new URL(url);
        return pathname.includes("/monarchy/") || pathname.includes("/hurricane-ir/");
    } catch {
        return false;
    }
}

/* Chromium reports the offline guard as a resource error. Mapbox GL throws
   "An API access token is required…" when the style URL is built with an
   empty token; react-map-gl logs that error event. Hurricane and Tectonics
   are the only routes that may show it: pass allowMapboxToken there. Home,
   Bio, Snow, RoyalTree, and every other caller fail if it appears. A local
   404 still fails. */
const TOKEN_ERROR = /API access token is required to use Mapbox GL/;
const BLOCKED_RESOURCE = /^Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/;

export function unexpectedConsoleErrors(messages, { allowMapboxToken = false } = {}) {
    return messages.filter((message) => {
        if (allowMapboxToken && TOKEN_ERROR.test(message.text)) return false;
        // Only the offline guard's aborted cross-origin loads. A local 404
        // is a different message and still fails the test.
        if (BLOCKED_RESOURCE.test(message.text) && message.url && !isLocal(message.url)) return false;
        return true;
    });
}

export const test = base.extend({
    blockedRequests: [
        async ({ context }, use) => {
            const blocked = [];
            const stubbed = [];
            blocked.stubbed = stubbed;
            await context.route("**/*", (route) => {
                const url = route.request().url();
                if (isStubbedImage(url)) {
                    stubbed.push(url);
                    return route.fulfill({
                        status: 200,
                        contentType: "image/png",
                        body: STUB_PNG,
                    });
                }
                if (isLocal(url)) return route.continue();
                blocked.push(url);
                return route.abort("blockedbyclient");
            });
            await context.routeWebSocket(/.*/, (ws) => {
                if (isLocal(ws.url())) return ws.connectToServer();
                blocked.push(ws.url());
                return ws.close();
            });
            await use(blocked);
        },
        { auto: true },
    ],
    consoleErrors: [
        async ({ page }, use) => {
            const messages = [];
            const pageErrors = [];
            const onConsole = (msg) => {
                if (msg.type() === "error") {
                    messages.push({ text: msg.text(), url: msg.location()?.url || "" });
                }
            };
            const onPageError = (error) => {
                pageErrors.push(error.message);
            };
            page.on("console", onConsole);
            page.on("pageerror", onPageError);
            await use({ messages, pageErrors });
        },
        { auto: true },
    ],
});

export { expect };
