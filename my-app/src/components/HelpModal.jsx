import * as React from 'react';

/* Shared help-guide chrome: a floating "?" button that opens a scrollable
   modal. Page-specific content is passed as children. */

export const helpSectionTitle = { margin: '16px 0 6px', fontSize: 15, color: 'var(--color-text)' };
export const helpList = { margin: '0 0 0 2px', paddingLeft: 18 };
export const helpListItem = { marginBottom: 4 };

function HelpModal({
    open,
    onOpen,
    onClose,
    title,
    children,
    fabPosition = { top: 20, left: 20 },
    fabTitle = 'Help',
}) {
    React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) {
        return (
            <button
                onClick={onOpen}
                aria-label="Open help"
                title={fabTitle}
                className="fab help-fab"
                style={{ position: 'absolute', zIndex: 9999, ...fabPosition }}
            >
                ?
            </button>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 20, color: 'var(--color-text)' }}>{title}</h2>
                    <button onClick={onClose} aria-label="Close help" className="modal-close">
                        &times;
                    </button>
                </div>
                {children}
                <div style={{ textAlign: 'right', marginTop: 20 }}>
                    <button onClick={onClose} className="btn-primary">Got it</button>
                </div>
            </div>
        </div>
    );
}

export default HelpModal;
