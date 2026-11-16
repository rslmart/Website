import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./global.css";
import Home from "./Home";
import NotFound from "./NotFound";
import Bio from "./Bio/Bio";
import Hurricane from "./Hurricane/Hurricane";
import RoyalTree from "./Royalty/RoyalTreePage";
import SnowPage from "./Snow/SnowPage";
import Tectonics from "./Tectonics/Tectonics";

const PAGES = [
    { path: "/Bio", element: <Bio/> },
    { path: "/Hurricane", element: <Hurricane/> },
    { path: "/RoyalTree", element: <RoyalTree/> },
    { path: "/Snow", element: <SnowPage/> },
    { path: "/Tectonics", element: <Tectonics/> },
];

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

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);
root.render(
    <BrowserRouter>
        <CanonicalPath>
            <Routes>
                <Route path="/" element={<Home/>} />
                {PAGES.map((page) => (
                    <Route key={page.path} path={page.path} element={page.element} />
                ))}
                <Route path="*" element={<NotFound/>} />
            </Routes>
        </CanonicalPath>
    </BrowserRouter>
);
