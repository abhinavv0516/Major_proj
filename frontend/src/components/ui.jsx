import { AlertTriangle, ShieldAlert, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import GlassyCard from './GlassyCard';
import { RISK, COLORS } from '../utils/format';

export const PageHeader = ({ title, subtitle, icon: Icon, children }) => (
  <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      {Icon && (
        <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(99,102,241,0.35)' }}>
          <Icon size={19} color="white" />
        </div>
      )}
      <div>
        <h1 style={{ fontSize: '23px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-1)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '3px' }}>{subtitle}</p>}
      </div>
    </div>
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
  </div>
);

export const Card = ({ title, subtitle, action, children, style, accent }) => (
  <GlassyCard style={{ ...(accent ? { borderColor: `${accent}40` } : {}), ...style }}>
    {(title || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <div>
          {title && <h2 className="section-title">{title}</h2>}
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </GlassyCard>
);

export const Stat = ({ icon: Icon, label, value, sub, color = COLORS.indigo }) => (
  <GlassyCard style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: color }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ minWidth: 0 }}>
        <p className="label" style={{ marginBottom: '8px' }}>{label}</p>
        <p style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>{value}</p>
        {sub && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>{sub}</p>}
      </div>
      {Icon && (
        <div style={{ width: '40px', height: '40px', borderRadius: '11px', flexShrink: 0, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={color} />
        </div>
      )}
    </div>
  </GlassyCard>
);

export const RiskBadge = ({ level }) => {
  const r = RISK[level];
  if (!r) return <span className="muted">—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, color: r.color, background: `${r.color}16`, border: `1px solid ${r.color}35` }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.color }} />
      {r.label}
    </span>
  );
};

export const VerdictBadge = ({ fraud }) => {
  if (fraud == null) return <span className="muted">Pending</span>;
  const color = fraud ? COLORS.rose : COLORS.emerald;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, color, background: `${color}14`, border: `1px solid ${color}35` }}>
      {fraud ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
      {fraud ? 'Flagged' : 'Legit'}
    </span>
  );
};

export const ReviewBadge = ({ status }) => {
  if (!status) return <span className="muted" style={{ fontSize: '12px' }}>Not reviewed</span>;
  const fraud = status === 'fraud';
  const color = fraud ? COLORS.rose : COLORS.emerald;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color }}>
      {fraud ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
      {fraud ? 'Confirmed fraud' : 'Cleared'}
    </span>
  );
};

export const ProbBar = ({ value, level, width = 70 }) => {
  if (value == null) return <span className="muted">—</span>;
  const color = RISK[level]?.color || (value >= 0.8 ? COLORS.rose : value >= 0.5 ? COLORS.amber : COLORS.emerald);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width, height: '5px', background: 'var(--bg-input)', borderRadius: '99px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${Math.max(value * 100, 2)}%`, background: color, borderRadius: '99px' }} />
      </div>
      <span className="mono" style={{ fontSize: '12px', fontWeight: 600, color }}>{(value * 100).toFixed(1)}%</span>
    </div>
  );
};

export const ErrorBanner = ({ message, onRetry }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '12px', marginBottom: '18px', background: 'var(--rose-t)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--rose)', fontSize: '13px' }}>
    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
    <span style={{ flex: 1 }}>{message}</span>
    {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
  </div>
);

export const Empty = ({ icon: Icon, title, children }) => (
  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)' }}>
    {Icon && <Icon size={30} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.7 }} />}
    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-2)' }}>{title}</p>
    {children && <div style={{ fontSize: '12px', marginTop: '6px' }}>{children}</div>}
  </div>
);

export const Loading = ({ label = 'Loading…' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '60px 0', color: 'var(--text-3)', fontSize: '13px' }}>
    <span className="spinner" />
    {label}
  </div>
);
