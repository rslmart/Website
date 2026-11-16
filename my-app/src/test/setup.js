import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { listen, server, takeBlockedRequests } from "./networkGuard";

/* ---- Browser APIs jsdom lacks ---- */

if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

if (typeof window !== "undefined" && !window.matchMedia) {
    // Never matches, so components see the desktop layout unless a test
    // overrides it (e.g. vi.spyOn(window, "matchMedia")).
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
    });
}

/* ---- WebGL/canvas libraries are replaced by light DOM mocks ----
   Real map, graph and chart rendering is covered only by the Playwright
   e2e suite. See src/test/mocks/ for what each mock renders. */

vi.mock("mapbox-gl", () => import("./mocks/mapboxGl.js"));
vi.mock("react-map-gl", () => import("./mocks/reactMapGl.jsx"));
vi.mock("@deck.gl/react", () => import("./mocks/deckglReact.jsx"));
vi.mock("@deck.gl/core", () => import("./mocks/deckglCore.js"));
vi.mock("@deck.gl/layers", () => import("./mocks/deckglLayers.js"));
vi.mock("@deck.gl/aggregation-layers", () => import("./mocks/deckglLayers.js"));
vi.mock("cytoscape", () => import("./mocks/cytoscape.js"));
vi.mock("cytoscape-dagre", () => ({ default: () => {} }));
vi.mock("recharts", async (importOriginal) => ({
    ...(await importOriginal()),
    ...(await import("./mocks/recharts.jsx")),
}));

/* ---- Network guard ---- */

beforeAll(listen);

afterEach(() => {
    cleanup();
    server.resetHandlers();
    const blocked = takeBlockedRequests();
    if (blocked.length) {
        throw new Error(
            `Test made real network request(s): ${blocked.join(", ")}. ` +
                "Mock them with MSW (server.use(...) from src/test/networkGuard.js)."
        );
    }
});

afterAll(() => server.close());
