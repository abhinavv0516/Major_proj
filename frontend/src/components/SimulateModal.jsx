import { useState } from 'react';
import { X, Play, FlaskConical } from 'lucide-react';
import { simulateTransactions, errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { COLORS, pct } from '../utils/format';

const PRESETS = [
  { label: 'Quiet day', count: 20, ratio: 0.02 },
  { label: 'Mixed traffic', count: 30, ratio: 0.15 },
  { label: 'Fraud wave', count: 40, ratio: 0.4 },
];

/**
 * Replays real transactions from the model's held-out test set through the full
 * scoring pipeline. Because each replayed row keeps its true label, the result shows
 * how many frauds the model actually caught.
 */
const SimulateModal = ({ open, onClose, onDone }) => {
  const { addToast } = useToast();
  const [count, setCount] = useState(20);
  const [ratio, setRatio] = useState(0.1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data } = await simulateTransactions(count, ratio);
      setResult(data);
      onDone?.(data);
      addToast(`Replayed ${data.created} transactions · ${data.flagged} flagged`, data.flagged ? 'fraud' : 'success', 4000);
    } catch (err) {
      addToast(errorMessage(err, 'Simulation failed'), 'error', 6000);
    } finally {
      setRunning(false);
    }
  };

  const outcomes = result?.transactions.reduce((acc, t) => {
    if (t.outcome) acc[t.outcome] = (acc[t.outcome] || 0) + 1;
    return acc;
  }, {});

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up" style={{ width: '100%', maxWidth: '480px', background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: '18px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <FlaskConical size={18} color={COLORS.indigo} />
          <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-1)', flex: 1 }}>Simulate live traffic</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '18px', lineHeight: 1.5 }}>
          Replays real transactions the model never saw in training, through the same pipeline as production
          (scoring, SHAP explanation, storage, live feed). Each keeps its true label, so you can see what the model caught.
        </p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button key={p.label} className="btn btn-sm" onClick={() => { setCount(p.count); setRatio(p.ratio); }}>{p.label}</button>
          ))}
        </div>

        <label className="label">Transactions: <span style={{ color: 'var(--text-1)' }}>{count}</span></label>
        <input type="range" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: '100%', marginBottom: '16px', accentColor: COLORS.indigo }} />

        <label className="label">Share of known fraud cases: <span style={{ color: 'var(--text-1)' }}>{pct(ratio, 0)}</span></label>
        <input type="range" min={0} max={1} step={0.01} value={ratio} onChange={(e) => setRatio(Number(e.target.value))} style={{ width: '100%', marginBottom: '20px', accentColor: COLORS.rose }} />

        <button className="btn btn-primary" style={{ width: '100%', padding: '11px' }} onClick={run} disabled={running}>
          {running ? <><span className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Scoring…</> : <><Play size={15} /> Run simulation</>}
        </button>

        {result && (
          <div className="fade-up" style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              ['Caught', outcomes.TP || 0, COLORS.emerald, 'Fraud flagged (true positive)'],
              ['Missed', outcomes.FN || 0, COLORS.rose, 'Fraud not flagged (false negative)'],
              ['False alarm', outcomes.FP || 0, COLORS.amber, 'Legit flagged (false positive)'],
              ['Correct pass', outcomes.TN || 0, COLORS.slate, 'Legit not flagged (true negative)'],
            ].map(([label, value, color, title]) => (
              <div key={label} title={title} style={{ padding: '10px', borderRadius: '10px', background: `${color}12`, border: `1px solid ${color}30`, textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulateModal;
