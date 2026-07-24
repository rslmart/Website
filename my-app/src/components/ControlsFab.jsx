import * as React from 'react';

/* "Controls" floating action button shown on mobile (bottom-right). Opens the
   page's bottom-sheet drawer of control panels. Sliders icon. */
function ControlsFab({ onClick, title = 'Controls' }) {
    return (
        <button
            type="button"
            className="fab controls-fab"
            onClick={onClick}
            aria-label={title}
            title={title}
        >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <line x1="4" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="4" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="9" cy="8" r="2.6" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="15" cy="16" r="2.6" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.8" />
            </svg>
        </button>
    );
}

export default ControlsFab;
