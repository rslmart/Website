import { useCallback, useEffect, useLayoutEffect, useState } from "react";

/* Site theme: "light" or "dark", applied as <html data-theme="...">, which
   switches the colour tokens in global.css.

   The inline script in index.html applies the same rules before first paint
   so there's no flash of the wrong theme; this hook takes over once React
   mounts. Keep the two in sync (src/hooks/useTheme.test.jsx checks the
   storage key and the light-only list against index.html).

   - An explicit choice from the toggle is saved in localStorage. Storage can
     throw (private mode, blocked site data), so reads and writes fall back
     to following the system setting without saving.
   - With no saved choice the theme follows prefers-color-scheme, live.
   - LIGHT_ONLY_PATHS stay light whatever the choice, until their own
     styles move onto the tokens: Bio until website-prop-bio-readability-a11y,
     the four data pages until website-site-theme-page-chrome. */

export const THEME_STORAGE_KEY = "theme";
export const LIGHT_ONLY_PATHS = ["/bio", "/hurricane", "/royaltree", "/snow", "/tectonics"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isLightOnlyPath(pathname) {
    return LIGHT_ONLY_PATHS.includes(pathname.toLowerCase().replace(/\/+$/, ""));
}

export function readStoredTheme() {
    try {
        const value = window.localStorage.getItem(THEME_STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

function writeStoredTheme(value) {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
        // Not persisted; the choice still applies until the page is reloaded.
    }
}

function systemTheme() {
    return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export default function useTheme(pathname) {
    const [stored, setStored] = useState(readStoredTheme);
    const [system, setSystem] = useState(systemTheme);

    useEffect(() => {
        const query = window.matchMedia?.(DARK_QUERY);
        if (!query?.addEventListener) return undefined;
        const onChange = (event) => setSystem(event.matches ? "dark" : "light");
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const preferred = stored ?? system;
    const lightOnly = isLightOnlyPath(pathname);
    const theme = lightOnly ? "light" : preferred;

    // Before paint, so a route change into or out of a light-only page
    // doesn't show one frame in the wrong theme.
    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    const toggle = useCallback(() => {
        const next = preferred === "dark" ? "light" : "dark";
        writeStoredTheme(next);
        setStored(next);
    }, [preferred]);

    return { theme, lightOnly, toggle };
}
