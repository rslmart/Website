import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
    createBrowserRouter,
    Navigate,
    Outlet,
    RouterProvider,
    ScrollRestoration,
    useLocation,
    useRouteError,
} from "react-router-dom";
import "./global.css";
import Home from "./Home";
import NotFound from "./NotFound";
import ThemeToggle from "./components/ThemeToggle";
import useTheme from "./hooks/useTheme";

/* Each page is its own chunk, fetched only when its route is visited, so
   e.g. /Snow and /Bio never download mapbox-gl or deck.gl. React Router's
   route-level `lazy` (rather than React.lazy + Suspense) loads the chunk
   before the navigation commits: the old page stays up meanwhile, and
   <ScrollRestoration> restores Back positions against the fully rendered
   page. Home and NotFound are tiny and stay in the entry chunk. */
const lazyPage = (load) => () => load().then((module) => ({ Component: module.default }));

const PAGES = [
    { path: "/Bio", name: "Resume", lazy: lazyPage(() => import("./Bio/Bio")) },
    { path: "/Hurricane", name: "Hurricane explorer", lazy: lazyPage(() => import("./Hurricane/Hurricane")) },
    { path: "/RoyalTree", name: "Royal family tree", lazy: lazyPage(() => import("./Royalty/RoyalTreePage")) },
    { path: "/Snow", name: "Washington snowfall", lazy: lazyPage(() => import("./Snow/SnowPage")) },
    { path: "/Tectonics", name: "Tectonic plates", lazy: lazyPage(() => import("./Tectonics/Tectonics")) },
];

function pageName(pathname) {
    if (pathname === "/") return "Home";
    return PAGES.find((page) => page.path === pathname)?.name ?? "Page not found";
}

/* React Router matches paths case-insensitively, so /bio and /Bio/ would both
   render Bio under different URLs. Redirect such variants to the one canonical
   spelling (keeping the query and hash) so each page has a single URL. */
function CanonicalPath({ children }) {
    const location = useLocation();
    const normalized = location.pathname.replace(/\/+$/, "").toLowerCase();
    const canonical = PAGES.find((page) => page.path.toLowerCase() === normalized);
    if (canonical && canonical.path !== location.pathname) {
        return (
            <Navigate
                replace
                to={{ pathname: canonical.path, search: location.search, hash: location.hash }}
                state={location.state}
            />
        );
    }
    return children;
}

/* After client-side navigation, move keyboard and screen-reader focus to the
   new page: its <h1> if it has one, otherwise a visually hidden label naming
   the page. Skipped on the first render so a fresh load keeps browser focus.
   preventScroll leaves positioning to <ScrollRestoration>. */
function RouteFocus() {
    const { pathname } = useLocation();
    const labelRef = useRef(null);
    const isFirstRender = useRef(true);
    // The label only carries text while it is the focus target, so pages with
    // an <h1> aren't announced twice.
    const [labelText, setLabelText] = useState("");

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const heading = document.querySelector("h1");
        if (heading) {
            setLabelText("");
            if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
            heading.focus({ preventScroll: true });
            return;
        }
        setLabelText(pageName(pathname));
    }, [pathname]);

    useEffect(() => {
        if (labelText) labelRef.current?.focus({ preventScroll: true });
    }, [labelText]);

    return (
        <div ref={labelRef} tabIndex={-1} className="visually-hidden">
            {labelText}
        </div>
    );
}

const RELOAD_FLAG = "route-chunk-reload";

function readReloadFlag() {
    try {
        return sessionStorage.getItem(RELOAD_FLAG);
    } catch {
        return null;
    }
}

function writeReloadFlag(value) {
    try {
        if (value) sessionStorage.setItem(RELOAD_FLAG, value);
        else sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
        // Storage unavailable (private mode etc.): skip the guard.
    }
}

/* Shown when a route throws or its chunk fails to download. A failed chunk
   usually means a deploy replaced the hashed assets under an open tab, so
   reload once to pick up the new build; the flag stops a reload loop. */
function RouteError() {
    const error = useRouteError();
    const isChunkError = /dynamically imported module|module script failed|error loading dynamically imported|unable to preload css/i
        .test(String(error?.message ?? error));

    useEffect(() => {
        if (isChunkError && !readReloadFlag()) {
            writeReloadFlag("1");
            window.location.reload();
        }
    }, [isChunkError]);

    return (
        <div className="home">
            <main className="home-hero">
                <h1 className="home-title">Something went wrong</h1>
                <p className="home-subtitle">This page couldn't be loaded.</p>
                <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 28, fontWeight: 600 }}
                    onClick={() => window.location.reload()}
                >
                    Reload
                </button>
            </main>
        </div>
    );
}

/* Shared shell for every route. <ScrollRestoration> starts each new page at
   the top and restores the previous position on Back/Forward. */
function RootLayout() {
    useEffect(() => writeReloadFlag(null), []);
    const { pathname } = useLocation();
    const { theme, lightOnly } = useTheme(pathname);
    // The toggle comes after the page in the DOM so Tab reaches the page's
    // Home button (visually to its left) first.
    return (
        <CanonicalPath>
            <ScrollRestoration />
            <RouteFocus />
            <Outlet />
            {!lightOnly && <ThemeToggle theme={theme} />}
        </CanonicalPath>
    );
}

const FUTURE_FLAGS = {
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_relativeSplatPath: true,
    v7_skipActionErrorRevalidation: true,
};

const router = createBrowserRouter(
    [
        {
            element: <RootLayout/>,
            errorElement: <RouteError/>,
            // Rendered (as nothing) while the first page's chunk loads.
            HydrateFallback: () => null,
            children: [
                { path: "/", element: <Home/> },
                ...PAGES.map(({ path, lazy }) => ({ path, lazy })),
                { path: "*", element: <NotFound/> },
            ],
        },
    ],
    { future: FUTURE_FLAGS }
);

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);
root.render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
