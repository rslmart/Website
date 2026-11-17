import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

// Modal "this view is large" dialog. Cancel (the safe choice) gets initial
// focus; Escape cancels; Tab stays inside the dialog; on close, focus goes
// back to whatever had it when the dialog opened (the slider or checkbox that
// asked for the large view).
export default function CapWarningDialog({ count, cap, onCancel, onContinue }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const returnTo = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
        returnTo.focus();
      }
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current.querySelectorAll('button');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
      <div className="royal-tree-cap-backdrop">
        <div
            ref={dialogRef}
            className="royal-tree-cap-warning"
            role="dialog"
            aria-modal="true"
            aria-labelledby="royal-tree-cap-title"
            aria-describedby="royal-tree-cap-body"
            onKeyDown={onKeyDown}
        >
          <strong id="royal-tree-cap-title">Show {count.toLocaleString()} people?</strong>
          <p id="royal-tree-cap-body">
            This view is larger than {cap.toLocaleString()} people. It can take a few
            seconds to lay out and pans more slowly. Fewer monarchies or a shorter
            look-back keeps it light.
          </p>
          <div className="royal-tree-cap-actions">
            <button ref={cancelRef} type="button" className="royal-tree-cap-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="royal-tree-cap-continue" onClick={onContinue}>
              Show all
            </button>
          </div>
        </div>
      </div>
  );
}

CapWarningDialog.propTypes = {
  count: PropTypes.number.isRequired,
  cap: PropTypes.number.isRequired,
  onCancel: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired,
};
