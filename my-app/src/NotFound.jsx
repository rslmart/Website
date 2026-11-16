import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import "./index.css";

/* Catch-all page for unknown URLs. It reuses the Home page's hero styles and
   marks itself noindex so search engines don't index soft-404 URLs. (The real
   HTTP 404 status is set at the CDN, outside this app.) */
function NotFound() {
    const { pathname } = useLocation();

    useEffect(() => {
        const robots = document.createElement("meta");
        robots.name = "robots";
        robots.content = "noindex";
        document.head.appendChild(robots);

        const previousTitle = document.title;
        document.title = "Page not found · Makoa's Website";

        return () => {
            robots.remove();
            document.title = previousTitle;
        };
    }, []);

    return (
        <div className="home">
            <main className="home-hero">
                <span className="home-eyebrow">404</span>
                <h1 className="home-title">Page not found</h1>
                <p className="home-subtitle">
                    There's nothing at{" "}
                    <code style={{ overflowWrap: "anywhere" }}>{pathname}</code>.
                    It may have moved, or the link may have a typo.
                </p>
                <Link
                    to="/"
                    className="btn-primary"
                    style={{ display: "inline-block", marginTop: 28, textDecoration: "none", fontWeight: 600 }}
                >
                    Back to home
                </Link>
            </main>
        </div>
    );
}

export default NotFound;
