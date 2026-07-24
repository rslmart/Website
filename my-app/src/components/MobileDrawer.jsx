import * as React from 'react';

/* Bottom-sheet drawer used on mobile to hold a page's control panels. Slides up
   from the bottom, backed by a dismissable scrim, with a drag handle, title, and
   an internally-scrollable body so it stays usable in landscape / short screens.
   All styling lives in global.css under mobile media queries. */
function MobileDrawer({ open, onClose, title, children }) {
    React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="mobile-drawer-overlay" onClick={onClose}>
            <div
                className="mobile-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mobile-drawer-header">
                    <span className="mobile-drawer-handle" aria-hidden="true" />
                    <div className="mobile-drawer-titlebar">
                        <h3 className="mobile-drawer-title">{title}</h3>
                        <button
                            type="button"
                            className="mobile-drawer-close"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            &times;
                        </button>
                    </div>
                </div>
                <div className="mobile-drawer-body">{children}</div>
            </div>
        </div>
    );
}

export default MobileDrawer;
