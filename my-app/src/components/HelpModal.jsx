import * as React from 'react';

/* Shared help-guide chrome: a floating "?" button that opens a scrollable
   dialog. Page-specific content is passed as children. Focus stays inside
   the dialog until it closes. */

export const helpSectionTitle = { margin: '16px 0 6px', fontSize: 15, color: 'var(--color-text)' };
export const helpList = { margin: '0 0 0 2px', paddingLeft: 18 };
export const helpListItem = { marginBottom: 4 };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(node) {
    if (!node) return [];
    return [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.getAttribute('tabindex') !== '-1');
}

function HelpModal({
    open,
    onOpen,
    onClose,
    title,
    children,
    fabPosition = { top: 20, left: 20 },
    fabTitle = 'Help',
}) {
    const dialogRef = React.useRef(null);
    const fabRef = React.useRef(null);
    const openerRef = React.useRef(null);
    const wasOpen = React.useRef(false);
    const titleId = React.useId();

    React.useEffect(() => {
        if (!open) return undefined;
        dialogRef.current?.focus();
        return undefined;
    }, [open]);

    React.useEffect(() => {
        if (open) {
            wasOpen.current = true;
            return undefined;
        }
        if (!wasOpen.current) return undefined;
        wasOpen.current = false;
        const back = openerRef.current;
        openerRef.current = null;
        if (back && back.isConnected) back.focus();
        else fabRef.current?.focus();
        return undefined;
    }, [open]);

    React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const node = dialogRef.current;
            if (!node) return;
            const focusable = focusableIn(node);
            if (!focusable.length) {
                event.preventDefault();
                node.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            const inside = node.contains(active);
            if (!inside) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
                return;
            }
            if (event.shiftKey && (active === first || active === node)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) {
        return (
            <button
                ref={fabRef}
                onClick={() => {
                    openerRef.current = fabRef.current;
                    onOpen();
                }}
                type="button"
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
            <div
                ref={dialogRef}
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 id={titleId} style={{ margin: 0, fontSize: 20, color: 'var(--color-text)' }}>{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close help" className="modal-close">
                        &times;
                    </button>
                </div>
                {children}
                <div style={{ textAlign: 'right', marginTop: 20 }}>
                    <button type="button" onClick={onClose} className="btn-primary">Got it</button>
                </div>
            </div>
        </div>
    );
}

export default HelpModal;
