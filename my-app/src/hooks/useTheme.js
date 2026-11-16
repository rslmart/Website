import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

/* Site theme: "light" or "dark", applied as <html data-theme="...">, which
   switches the colour tokens in global.css.

   The inline script in index.html applies the same rules before first paint
   so there's no flash of the wrong theme; this hook takes over once React
   mounts. Keep the two in sync (src/hooks/useTheme.test.jsx checks the
   storage key and the light-only list against index.html).

   - The visitor's choice is "light", "dark" or "system" (follow
     prefers-color-scheme, live). An explicit light or dark is saved in
     localStorage; "system" removes the saved value.
   - Storage can throw (private mode, blocked site data). Then the choice is
     kept in memory for this page load only and nothing is saved.
   - LIGHT_ONLY_PATHS stay light whatever the choice, until their own
     styles move onto the tokens: Bio until website-prop-bio-readability-a11y. */

export const THEME_STORAGE_KEY = "theme";
export const LIGHT_ONLY_PATHS = ["/bio"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isLightOnlyPath(pathname) {
    return LIGHT_ONLY_PATHS.includes(pathname.toLowerCase().replace(/\/+$/, ""));
}

// Used only while storage is unreadable.
let memoryChoice = null;
const listeners = new Set();

/* The saved explicit choice, "light" | "dark", or null for "follow system". */
export function readStoredTheme() {
    try {
        const value = window.localStorage.getItem(THEME_STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return memoryChoice;
    }
}

/* Save a choice: "light", "dark" or "system". */
export function setThemeChoice(choice) {
    const value = choice === "light" || choice === "dark" ? choice : null;
    try {
        if (value) window.localStorage.setItem(THEME_STORAGE_KEY, value);
        else window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
        memoryChoice = value;
    }
    listeners.forEach((notify) => notify());
}

function subscribe(notify) {
    listeners.add(notify);
    // Another tab changed the choice.
    window.addEventListener("storage", notify);
    return () => {
        listeners.delete(notify);
        window.removeEventListener("storage", notify);
    };
}

function systemTheme() {
    return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

/* The current choice ("light" | "dark" | "system") and a setter. Shared by
   every caller, so the toggle and RootLayout stay in step. */
export function useThemeChoice() {
    const stored = useSyncExternalStore(subscribe, readStoredTheme, () => null);
    return { choice: stored ?? "system", setChoice: setThemeChoice };
}

export default function useTheme(pathname) {
    const { choice } = useThemeChoice();
    const [system, setSystem] = useState(systemTheme);

    useEffect(() => {
        const query = window.matchMedia?.(DARK_QUERY);
        if (!query?.addEventListener) return undefined;
        const onChange = (event) => setSystem(event.matches ? "dark" : "light");
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const preferred = choice === "system" ? system : choice;
    const lightOnly = isLightOnlyPath(pathname);
    const theme = lightOnly ? "light" : preferred;

    // Before paint, so a route change into or out of a light-only page
    // doesn't show one frame in the wrong theme.
    useLayoutEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    const toggle = useCallback(() => {
        setThemeChoice(preferred === "dark" ? "light" : "dark");
    }, [preferred]);

    return { theme, lightOnly, toggle, choice, system };
}
