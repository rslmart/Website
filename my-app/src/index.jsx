import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
    createBrowserRouter,
    Navigate,
    Outlet,
    RouterProvider,
    ScrollRestoration,
    useLocation,
} from "react-router-dom";
import "./global.css";
import Home from "./Home";
import NotFound from "./NotFound";
import Bio from "./Bio/Bio";
import Hurricane from "./Hurricane/Hurricane";
import RoyalTree from "./Royalty/RoyalTreePage";
import SnowPage from "./Snow/SnowPage";
import Tectonics from "./Tectonics/Tectonics";

const PAGES = [
    { path: "/Bio", name: "Resume", element: <Bio/> },
    { path: "/Hurricane", name: "Hurricane explorer", element: <Hurricane/> },
    { path: "/RoyalTree", name: "Royal family tree", element: <RoyalTree/> },
    { path: "/Snow", name: "Washington snowfall", element: <SnowPage/> },
    { path: "/Tectonics", name: "Tectonic plates", element: <Tectonics/> },
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

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const heading = document.querySelector("h1");
        const target = heading ?? labelRef.current;
        if (!target) return;
        if (target === heading && !heading.hasAttribute("tabindex")) {
            heading.setAttribute("tabindex", "-1");
        }
        target.focus({ preventScroll: true });
    }, [pathname]);

    return (
        <div ref={labelRef} tabIndex={-1} className="visually-hidden">
            {pageName(pathname)}
        </div>
    );
}

/* Shared shell for every route. <ScrollRestoration> starts each new page at
   the top and restores the previous position on Back/Forward. */
function RootLayout() {
    return (
        <CanonicalPath>
            <ScrollRestoration />
            <RouteFocus />
            <Outlet />
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
            children: [
                { path: "/", element: <Home/> },
                ...PAGES.map(({ path, element }) => ({ path, element })),
                { path: "*", element: <NotFound/> },
            ],
        },
    ],
    { future: FUTURE_FLAGS }
);

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);
root.render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
