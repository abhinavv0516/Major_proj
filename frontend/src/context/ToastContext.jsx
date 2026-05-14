import { createContext, useContext, useState, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, AlertCircle, X, Info } from 'lucide-react';

const ToastContext = createContext();

const icons = {
  fraud:   <ShieldAlert size={18} color="#f43f5e" />,
  success: <ShieldCheck size={18} color="#10b981" />,
  error:   <AlertCircle size={18} color="#f59e0b" />,
  info:    <Info size={18} color="#6366f1" />,
};

const borderColor = { fraud: '#f43f5e', success: '#10b981', error: '#f59e0b', info: '#6366f1' };
const bgColor = { fraud: 'rgba(244,63,94,0.12)', success: 'rgba(16,185,129,0.10)', error: 'rgba(245,158,11,0.12)', info: 'rgba(99,102,241,0.12)' };

let _id = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        zIndex: 9999, pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '14px 16px', borderRadius: '14px', minWidth: '300px', maxWidth: '380px',
            background: 'rgba(13,20,38,0.95)',
            border: `1px solid ${borderColor[t.type]}40`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${borderColor[t.type]}20`,
            backdropFilter: 'blur(20px)',
            animation: 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            pointerEvents: 'all',
            borderLeft: `3px solid ${borderColor[t.type]}`,
          }}>
            <div style={{ flexShrink: 0, marginTop: '1px' }}>{icons[t.type]}</div>
            <p style={{ flex: 1, fontSize: '13px', color: '#e2e8f0', lineHeight: '1.5', margin: 0 }}>{t.message}</p>
            <button onClick={() => dismiss(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#475569', padding: '2px', flexShrink: 0,
            }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
