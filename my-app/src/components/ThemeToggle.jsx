import * as React from "react";

/* Light/dark switch, fixed to the top-right corner of the shell pages.
   The label names the theme it switches to. */
function ThemeToggle({ theme, onToggle }) {
    const next = theme === "dark" ? "light" : "dark";
    return (
        <button
            type="button"
            className="fab theme-fab"
            onClick={onToggle}
            aria-label={`Switch to ${next} theme`}
            title={`Switch to ${next} theme`}
        >
            {theme === "dark" ? (
                // Sun: shown in dark mode.
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                    <path
                        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                    />
                </svg>
            ) : (
                // Moon: shown in light mode.
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                        d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                    />
                </svg>
            )}
        </button>
    );
}

export default ThemeToggle;
