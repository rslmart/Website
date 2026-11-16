import { setupServer } from "msw/node";

/* Offline guard for unit and component tests. MSW intercepts fetch, XHR and
   Node's http/https. Any request no test handler answers is failed with a
   network error, recorded here, and turned into a test failure by setup.js.
   Requests to localhost are let through. Tests add handlers with
   `server.use(http.get(url, () => HttpResponse.json(...)))` from "msw". */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const blocked = [];

function frameUrl(frame) {
    return String(
        frame?.data?.request?.url ?? frame?.data?.connection?.client?.url ?? `<${frame?.protocol} frame>`
    );
}

function isLocal(url) {
    try {
        return LOCAL_HOSTS.has(new URL(url).hostname);
    } catch {
        return false;
    }
}

export const server = setupServer();

export function listen() {
    server.listen({
        onUnhandledFrame({ frame, defaults }) {
            const url = frameUrl(frame);
            if (isLocal(url)) return;
            blocked.push(url);
            defaults.error();
            // In MSW 3 defaults.error() only logs; rejecting is what fails
            // the request. Response.error() surfaces as a network error
            // (fetch rejects with TypeError); WebSockets get an error event.
            throw frame.protocol === "http" ? Response.error() : new Error(`Blocked network access to ${url}`);
        },
    });
}

/* Returns and clears the requests blocked so far. A test that deliberately
   makes a network call takes them so the afterEach check doesn't fail it. */
export function takeBlockedRequests() {
    return blocked.splice(0);
}
