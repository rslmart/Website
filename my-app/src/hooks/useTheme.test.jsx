import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "../components/ThemeToggle";
import useTheme, { LIGHT_ONLY_PATHS, THEME_STORAGE_KEY, isLightOnlyPath, resetThemeMemoryForTests } from "./useTheme";

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
    const { theme, lightOnly } = useTheme(pathname);
    return lightOnly ? <p>light only</p> : <ThemeToggle theme={theme} />;
}

const htmlTheme = () => document.documentElement.dataset.theme;

/* Open the theme menu and pick an option. */
async function choose(option) {
    await userEvent.click(screen.getByRole("button", { name: /^Theme:/ }));
    await userEvent.click(screen.getByRole("radio", { name: option }));
}

beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
});

afterEach(() => {
    resetThemeMemoryForTests();
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

        expect(screen.getByRole("button", { name: "Theme: System (light)" })).toBeInTheDocument();
        await choose("Dark");
        expect(htmlTheme()).toBe("dark");
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

        act(() => setSystem("light"));
        expect(htmlTheme()).toBe("dark");

        // A fresh mount (a reload) reads the saved choice.
        unmount();
        delete document.documentElement.dataset.theme;
        render(<Shell />);
        expect(htmlTheme()).toBe("dark");
        expect(screen.getByRole("button", { name: "Theme: Dark" })).toBeInTheDocument();
    });

    it("returns to following the system and forgets the saved choice", async () => {
        const setSystem = mockSystemTheme("light");
        window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
        render(<Shell />);
        expect(htmlTheme()).toBe("dark");

        await choose("System");
        expect(htmlTheme()).toBe("light");
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
        expect(screen.getByRole("radio", { name: "System" })).toBeChecked();

        act(() => setSystem("dark"));
        expect(htmlTheme()).toBe("dark");
        expect(screen.getByRole("button", { name: "Theme: System (dark)" })).toBeInTheDocument();
    });

    it("opens on the current choice, and Escape closes it and returns focus", async () => {
        mockSystemTheme("light");
        render(<Shell />);
        const button = screen.getByRole("button", { name: /^Theme:/ });
        expect(button).toHaveAttribute("aria-expanded", "false");

        await userEvent.click(button);
        expect(button).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("radio", { name: "System" })).toHaveFocus();

        await userEvent.keyboard("{Escape}");
        expect(button).toHaveAttribute("aria-expanded", "false");
        expect(button).toHaveFocus();
        expect(screen.queryByRole("radio")).toBeNull();
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

        await choose("Light");
        expect(htmlTheme()).toBe("light");
    });

    it("applies a choice when storage reads but cannot write", async () => {
        mockSystemTheme("dark");
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });

        render(<Shell />);
        expect(htmlTheme()).toBe("dark");

        await choose("Light");
        expect(htmlTheme()).toBe("light");
    });

    it("ignores an unknown saved value", () => {
        mockSystemTheme("dark");
        window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
        render(<Shell />);
        expect(htmlTheme()).toBe("dark");
    });

    /* No page is light-only now; add a temporary entry to exercise the
       mechanism. */
    function withLightOnly(path, fn) {
        LIGHT_ONLY_PATHS.push(path);
        try {
            fn();
        } finally {
            LIGHT_ONLY_PATHS.splice(LIGHT_ONLY_PATHS.indexOf(path), 1);
        }
    }

    it("has no light-only pages: Bio follows the theme and shows the toggle", () => {
        expect(LIGHT_ONLY_PATHS).toEqual([]);
        mockSystemTheme("dark");
        render(<Shell pathname="/Bio" />);
        expect(htmlTheme()).toBe("dark");
        expect(screen.getByRole("button", { name: "Theme: System (dark)" })).toBeInTheDocument();
    });

    it("keeps light-only pages light and hides the toggle there", () => {
        withLightOnly("/light-test", () => {
            mockSystemTheme("dark");
            window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
            const { rerender } = render(<Shell pathname="/Light-Test" />);
            expect(htmlTheme()).toBe("light");
            expect(screen.queryByRole("button")).toBeNull();

            rerender(<Shell pathname="/" />);
            expect(htmlTheme()).toBe("dark");
        });
    });

    it("matches light-only paths case-insensitively, with or without a trailing slash", () => {
        withLightOnly("/light-test", () => {
            expect(isLightOnlyPath("/Light-Test")).toBe(true);
            expect(isLightOnlyPath("/light-test/")).toBe(true);
            expect(isLightOnlyPath("/Snow")).toBe(false);
            expect(isLightOnlyPath("/")).toBe(false);
            expect(isLightOnlyPath("/light-testing")).toBe(false);
        });
        expect(isLightOnlyPath("/Bio")).toBe(false);
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
        ["/Bio/", null, true, "dark"],
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
