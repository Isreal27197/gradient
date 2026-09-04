import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import Icon from './Icons.jsx';

/* --------------------------------------------------------------- primitives */

export function Card({ children, className = '', ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function Field({ label, hint, error, children, ...rest }) {
  return (
    <div className="field" {...rest}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

export function Input(props) { return <input className="input" {...props} />; }
export function Select(props) { return <select className="select" {...props} />; }
export function Textarea(props) { return <textarea className="input" rows={3} {...props} />; }

export function Button({ children, variant = '', size = '', loading, className = '', ...rest }) {
  // className is merged rather than spread, otherwise a caller-supplied class
  // would replace the base `btn` styling entirely.
  return (
    <button className={['btn', variant, size, className].filter(Boolean).join(' ')}
            disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}

export function Badge({ tone = 'plain', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({ icon = '📘', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, max = 100, tone = '' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={`progress ${tone}`}><span style={{ width: `${pct}%` }} /></div>;
}

/* -------------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, description, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.Close size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- toasts */

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, type = 'info') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = {
    show: push,
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span style={{ display: 'grid', placeItems: 'center' }}>
              {t.type === 'success' ? <Icon.Check size={15} /> : t.type === 'error' ? <Icon.Warn size={15} /> : <Icon.Spark size={15} />}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------ confirm modal */

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="small muted">{message}</p>
    </Modal>
  );
}
