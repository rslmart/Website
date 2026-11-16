import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "../components/ThemeToggle";
import useTheme, { LIGHT_ONLY_PATHS, THEME_STORAGE_KEY, isLightOnlyPath } from "./useTheme";

/* A matchMedia stand-in whose prefers-color-scheme answer tests can flip. */
function mockSystemTheme(initial) {
    let dark = initial === "dark";
    const listeners = new Set();
    vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
        get matches() {
            return media.includes("dark") && dark;
        },
        media,
        addEventListener: (_type, fn) => listeners.add(fn),
        removeEventListener: (_type, fn) => listeners.delete(fn),
    }));
    return (next) => {
        dark = next === "dark";
        listeners.forEach((fn) => fn({ matches: dark }));
    };
}

function Shell({ pathname = "/" }) {
    const { theme, lightOnly, toggle } = useTheme(pathname);
    return lightOnly ? <p>light only</p> : <ThemeToggle theme={theme} onToggle={toggle} />;
}

const htmlTheme = () => document.documentElement.dataset.theme;

beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("useTheme", () => {
    it("follows prefers-color-scheme when nothing is saved, including live changes", () => {
        const setSystem = mockSystemTheme("dark");
        render(<Shell />);
        expect(htmlTheme()).toBe("dark");

        act(() => setSystem("light"));
        expect(htmlTheme()).toBe("light");
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it("persists the toggled choice, which then beats the system setting", async () => {
        const setSystem = mockSystemTheme("light");
        const { unmount } = render(<Shell />);
        expect(htmlTheme()).toBe("light");

        await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
        expect(htmlTheme()).toBe("dark");
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

        act(() => setSystem("light"));
        expect(htmlTheme()).toBe("dark");

        // A fresh mount (a reload) reads the saved choice.
        unmount();
        delete document.documentElement.dataset.theme;
        render(<Shell />);
        expect(htmlTheme()).toBe("dark");
        expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    });

    it("falls back to the system theme and still toggles when storage throws", async () => {
        mockSystemTheme("dark");
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });

        render(<Shell />);
        expect(htmlTheme()).toBe("dark");

        await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
        expect(htmlTheme()).toBe("light");
    });

    it("ignores an unknown saved value", () => {
        mockSystemTheme("dark");
        window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
        render(<Shell />);
        expect(htmlTheme()).toBe("dark");
    });

    it("keeps light-only pages light and hides the toggle there", () => {
        mockSystemTheme("dark");
        window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
        const { rerender } = render(<Shell pathname="/Bio" />);
        expect(htmlTheme()).toBe("light");
        expect(screen.queryByRole("button")).toBeNull();

        rerender(<Shell pathname="/" />);
        expect(htmlTheme()).toBe("dark");
    });

    it("matches light-only paths case-insensitively, with or without a trailing slash", () => {
        expect(isLightOnlyPath("/Bio")).toBe(true);
        expect(isLightOnlyPath("/snow/")).toBe(true);
        expect(isLightOnlyPath("/")).toBe(false);
        expect(isLightOnlyPath("/Biology")).toBe(false);
    });
});

describe("index.html no-flash script", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8") // vitest runs in my-app/;
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

    it("uses the same storage key and light-only list as the hook", () => {
        expect(script).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
        const list = JSON.parse(script.match(/var lightOnly = (\[[^\]]*\])/)[1]);
        expect(list).toEqual(LIGHT_ONLY_PATHS);
    });

    it.each([
        ["/", null, true, "dark"],
        ["/", "light", true, "light"],
        ["/", null, false, "light"],
        ["/Bio/", "dark", true, "light"],
    ])("on %s with saved %s and system dark=%s sets %s", (path, saved, systemDark, expected) => {
        mockSystemTheme(systemDark ? "dark" : "light");
        if (saved) window.localStorage.setItem(THEME_STORAGE_KEY, saved);
        window.history.replaceState(null, "", path);
        new Function(script)();
        expect(htmlTheme()).toBe(expected);
        window.history.replaceState(null, "", "/");
    });

    it("declares a theme-color for each scheme", () => {
        expect(html).toContain('<meta name="theme-color" content="#166534" media="(prefers-color-scheme: light)" />');
        expect(html).toContain('<meta name="theme-color" content="#0B0B0B" media="(prefers-color-scheme: dark)" />');
    });
});
