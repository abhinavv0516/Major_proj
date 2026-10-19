// Formatting helpers and the chart palette (hex values: SVG attributes can't read CSS variables).

export const COLORS = {
  indigo: '#6366f1',
  rose: '#f43f5e',
  emerald: '#10b981',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  purple: '#a855f7',
  slate: '#94a3b8',
};

export const RISK = {
  low: { label: 'Low', color: COLORS.emerald },
  medium: { label: 'Medium', color: COLORS.amber },
  high: { label: 'High', color: COLORS.rose },
};

export const AXIS_TICK = { fill: COLORS.slate, fontSize: 11 };
export const GRID_STROKE = 'rgba(148,163,184,0.18)';
export const TOOLTIP_STYLE = {
  background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: '10px',
  padding: '8px 12px', color: 'var(--text-1)', fontSize: '12px', boxShadow: 'var(--shadow)',
};

export const num = (n, digits = 0) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const money = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pct = (ratio, digits = 1) => (ratio == null || Number.isNaN(ratio) ? '—' : `${(ratio * 100).toFixed(digits)}%`);

export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export const timeAgo = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/** Top-N entries of a {feature: value} map by absolute value. */
export const topEntries = (obj, n = 8) =>
  Object.entries(obj || {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n);

export const FEATURES = ['time', ...Array.from({ length: 28 }, (_, i) => `v${i + 1}`), 'amount'];
