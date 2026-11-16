import * as React from "react";
import { useThemeChoice } from "../hooks/useTheme";

/* Theme menu: a round button that opens a small panel of three native radio
   buttons (Light, Dark, System). Native radios give arrow-key selection and
   screen-reader semantics for free; the choice applies as soon as it changes.
   Escape, a click outside, or tabbing away closes the panel.

   Placement (global.css): top-right on the shell pages; on pages with the
   Home button it sits beside it, top-left, clear of each page's panels. */

const OPTIONS = [
    ["light", "Light"],
    ["dark", "Dark"],
    ["system", "System"],
];

const SunIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
            d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
        />
    </svg>
);

const MoonIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
    </svg>
);

// Half-filled circle: "follows the system".
const SystemIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
    </svg>
);

function ThemeToggle({ theme }) {
    const { choice, setChoice } = useThemeChoice();
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef(null);
    const buttonRef = React.useRef(null);
    const panelId = React.useId();

    React.useEffect(() => {
        if (!open) return undefined;
        // Start keyboard users on the current choice.
        rootRef.current?.querySelector("input:checked")?.focus();
        const onPointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const current = choice === "system" ? `System (${theme})` : choice === "dark" ? "Dark" : "Light";
    const Icon = choice === "system" ? SystemIcon : theme === "dark" ? MoonIcon : SunIcon;

    return (
        <div
            ref={rootRef}
            className="theme-menu"
            onBlur={(event) => {
                if (open && !rootRef.current?.contains(event.relatedTarget)) setOpen(false);
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                className="fab theme-fab"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`Theme: ${current}`}
                title={`Theme: ${current}`}
                onClick={() => setOpen((wasOpen) => !wasOpen)}
            >
                <Icon />
            </button>
            <div id={panelId} className="theme-menu-panel" hidden={!open}>
                <fieldset>
                    <legend>Theme</legend>
                    {OPTIONS.map(([value, label]) => (
                        <label key={value} className="theme-menu-option">
                            <input
                                type="radio"
                                name={`${panelId}-theme`}
                                value={value}
                                checked={choice === value}
                                onChange={() => setChoice(value)}
                            />
                            {label}
                        </label>
                    ))}
                </fieldset>
            </div>
        </div>
    );
}

export default ThemeToggle;
