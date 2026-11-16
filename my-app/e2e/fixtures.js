import { test as base, expect } from "@playwright/test";

/* Offline guard for every e2e test: requests to anything but the local
   preview server are aborted (fonts, map tiles, analytics...). Tests can read
   what was blocked from the `blockedRequests` fixture. Import `test` and
   `expect` from this file, not from @playwright/test. */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocal(url) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "data:" || protocol === "blob:" || LOCAL_HOSTS.has(hostname);
    } catch {
        return false;
    }
}

export const test = base.extend({
    blockedRequests: [
        async ({ context }, use) => {
            const blocked = [];
            await context.route("**/*", (route) => {
                const url = route.request().url();
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
});

export { expect };
