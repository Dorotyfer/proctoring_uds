'use client';

import { useEffect, useRef } from 'react';

export default function PanelDialog({ title, description, children, confirmLabel, cancelLabel = 'Cancelar', onConfirm, onCancel, busy = false, intent = 'danger' }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busy) {
        onCancel();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      trapFocus(event, dialogRef.current);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [busy, onCancel]);

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="panel-dialog" role="dialog" aria-modal="true" aria-labelledby="panel-dialog-title" aria-describedby="panel-dialog-description">
        <div className="dialog-heading">
          <span className={`dialog-mark dialog-mark-${intent}`} aria-hidden="true">!</span>
          <div>
            <p className="eyebrow">Confirmación requerida</p>
            <h2 id="panel-dialog-title">{title}</h2>
          </div>
        </div>
        <p id="panel-dialog-description">{description}</p>
        {children}
        <div className="dialog-actions">
          <button ref={cancelRef} className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className={`button button-${intent}`} type="button" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function trapFocus(event, dialog) {
  if (!dialog) {
    return;
  }
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), textarea, input, select, a[href]')];
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
