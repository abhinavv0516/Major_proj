import { topEntries, COLORS } from '../utils/format';

/**
 * Diverging bar chart of SHAP contributions (log-odds).
 * Right / red = pushes the score towards fraud, left / green = towards legitimate.
 */
const ShapBars = ({ values, features, limit = 8 }) => {
  const rows = topEntries(values, limit);
  if (!rows.length) return <p className="muted" style={{ fontSize: '12px' }}>No explanation available.</p>;
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)), 1e-9);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {rows.map(([name, v]) => {
        const w = (Math.abs(v) / max) * 50;
        const color = v > 0 ? COLORS.rose : COLORS.emerald;
        const raw = features?.[name] ?? features?.[name.toLowerCase()];
        return (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 58px', alignItems: 'center', gap: '8px' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={raw != null ? `${name} = ${raw}` : name}>
              {name}{raw != null && <span className="muted"> {Number(raw).toFixed(name === 'Time' ? 0 : 2)}</span>}
            </span>
            <div style={{ position: 'relative', height: '10px', background: 'var(--bg-input)', borderRadius: '4px' }}>
              <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '1px', background: 'var(--border-2)' }} />
              <div style={{
                position: 'absolute', top: 0, bottom: 0, borderRadius: '4px', background: color,
                left: v > 0 ? '50%' : `${50 - w}%`, width: `${w}%`, transition: 'all .5s ease',
              }} />
            </div>
            <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color, textAlign: 'right' }}>
              {v > 0 ? '+' : ''}{v.toFixed(3)}
            </span>
          </div>
        );
      })}
      <p style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '4px' }}>
        SHAP contribution in log-odds · <span style={{ color: COLORS.rose }}>red</span> pushes towards fraud,{' '}
        <span style={{ color: COLORS.emerald }}>green</span> towards legitimate
      </p>
    </div>
  );
};

export default ShapBars;
