import { useEffect, useMemo, useState } from "react";

/* Reads CSS custom properties (the colour tokens in global.css) as resolved
   strings, and re-renders when the theme changes.

   For libraries that can't use var(): deck.gl layer colours, Cytoscape
   styles and Recharts series props. Page chrome should keep using var() in
   CSS; this is only for colours handed to a canvas or a JS prop.

   The theme is the data-theme attribute on <html> (set by useTheme before
   paint), so a MutationObserver on that attribute is enough: every token
   change goes through it.

     const { tokens, theme } = useThemeTokens(["--map-ink", "--color-text"]);
     tokens["--map-ink"]  // "#282828" in light, "#DADDD8" in dark
*/

function readTokens(names) {
    const style = window.getComputedStyle(document.documentElement);
    const tokens = {};
    for (const name of names) tokens[name] = style.getPropertyValue(name).trim();
    return tokens;
}

function readTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export default function useThemeTokens(names) {
    // Callers usually pass an array literal; key on its contents.
    const key = names.join("|");
    const stableNames = useMemo(() => key.split("|").filter(Boolean), [key]);
    const [state, setState] = useState(() => ({ theme: readTheme(), tokens: readTokens(stableNames) }));

    useEffect(() => {
        const update = () => {
            const next = { theme: readTheme(), tokens: readTokens(stableNames) };
            setState((prev) =>
                prev.theme === next.theme && stableNames.every((n) => prev.tokens[n] === next.tokens[n])
                    ? prev
                    : next
            );
        };
        update(); // names changed, or the theme moved between render and effect
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, [stableNames]);

    return state;
}

/* A CSS colour ("#RGB", "#RRGGBB", "rgb()/rgba()") as a deck.gl [r, g, b, a]
   array (a in 0-255). Unparseable input gives `fallback`. */
export function cssColorToRgba(color, alpha = 255, fallback = [128, 128, 128, alpha]) {
    const value = (color || "").trim();
    let match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (match) {
        let hex = match[1];
        if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
        const n = parseInt(hex, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
    }
    match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
    if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
    return fallback;
}
