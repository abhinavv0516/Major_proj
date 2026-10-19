import { useCallback, useEffect, useState } from 'react';
import { X, ShieldAlert, ShieldCheck, Clock, User, History } from 'lucide-react';
import { getTransaction, reviewTransaction, errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import ShapBars from './ShapBars';
import { RiskBadge, VerdictBadge, ReviewBadge, Loading, ErrorBanner } from './ui';
import { money, dateTime, COLORS, pct } from '../utils/format';

const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
    <span className="muted">{k}</span>
    <span style={{ fontWeight: 600, color: 'var(--text-1)', textAlign: 'right' }}>{v}</span>
  </div>
);

const ACTION_LABEL = { created: 'Received', scored: 'Scored by model', reviewed: 'Analyst review', error: 'Scoring error' };

/** Side panel with the full explanation of one transaction and the analyst review actions. */
const TransactionDrawer = ({ id, onClose, onReviewed }) => {
  const { addToast } = useToast();
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await getTransaction(id);
      setTx(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load transaction'));
    }
  }, [id]);

  useEffect(() => {
    setTx(null);
    setNotes('');
    if (id != null) load();
  }, [id, load]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (id == null) return null;

  const review = async (label) => {
    setSaving(true);
    try {
      const { data } = await reviewTransaction(id, label, notes || null);
      setTx(data);
      setNotes('');
      onReviewed?.(data);
      addToast(label === 'fraud' ? `#${id} confirmed as fraud` : `#${id} cleared as legitimate`, label === 'fraud' ? 'fraud' : 'success', 3000);
    } catch (err) {
      addToast(errorMessage(err, 'Review failed'), 'error', 5000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(480px, 100%)', overflowY: 'auto',
        background: 'var(--bg-1)', borderLeft: '1px solid var(--border-2)', boxShadow: '-20px 0 50px rgba(0,0,0,0.2)',
        animation: 'slideIn .25s ease', padding: '22px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-1)', flex: 1 }}>Transaction <span className="mono">#{id}</span></h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        {error && <ErrorBanner message={error} onRetry={load} />}
        {!tx && !error && <Loading />}

        {tx && (
          <>
            {/* Verdict */}
            <div style={{
              padding: '16px', borderRadius: '14px', marginBottom: '18px',
              background: tx.is_fraud ? 'var(--rose-t)' : 'var(--emerald-t)',
              border: `1px solid ${tx.is_fraud ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`,
              display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              {tx.is_fraud ? <ShieldAlert size={30} color={COLORS.rose} /> : <ShieldCheck size={30} color={COLORS.emerald} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: tx.is_fraud ? COLORS.rose : COLORS.emerald, lineHeight: 1 }}>
                  {pct(tx.fraud_probability)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>fraud probability · {tx.model_version}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <VerdictBadge fraud={tx.is_fraud} />
                <RiskBadge level={tx.risk_level} />
              </div>
            </div>

            <Row k="Amount" v={money(tx.amount)} />
            <Row k="Received" v={dateTime(tx.submitted_at)} />
            <Row k="Source" v={tx.source} />
            <Row k="Scoring time" v={tx.processing_ms != null ? `${tx.processing_ms} ms` : '—'} />
            {tx.ground_truth != null && <Row k="True label (test data)" v={tx.ground_truth ? 'Fraud' : 'Legitimate'} />}
            {tx.outcome && <Row k="Outcome" v={{ TP: 'Caught fraud', FP: 'False alarm', FN: 'Missed fraud', TN: 'Correctly passed' }[tx.outcome]} />}

            {/* Explanation */}
            <h3 className="section-title" style={{ margin: '22px 0 4px' }}>Why the model decided this</h3>
            <p className="section-sub" style={{ marginBottom: '12px' }}>Top feature contributions for this transaction</p>
            <ShapBars values={tx.shap_values} features={tx.features} limit={10} />

            {/* Review */}
            <h3 className="section-title" style={{ margin: '24px 0 4px' }}>Analyst review</h3>
            <p className="section-sub" style={{ marginBottom: '10px' }}>
              Current: <ReviewBadge status={tx.review_status} />
            </p>
            <textarea className="input" rows={2} placeholder="Notes (optional) — e.g. called cardholder, card was stolen"
              value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical', marginBottom: '10px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-danger" style={{ flex: 1 }} disabled={saving} onClick={() => review('fraud')}>
                <ShieldAlert size={14} /> Confirm fraud
              </button>
              <button className="btn btn-success" style={{ flex: 1 }} disabled={saving} onClick={() => review('legit')}>
                <ShieldCheck size={14} /> Mark legitimate
              </button>
            </div>

            {/* Audit trail */}
            <h3 className="section-title" style={{ margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <History size={15} /> Audit trail
            </h3>
            <div style={{ borderLeft: '2px solid var(--border-2)', marginLeft: '6px', paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tx.audit_trail.map((a, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '-20px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: a.action === 'error' ? COLORS.rose : COLORS.indigo, border: '2px solid var(--bg-1)' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>{ACTION_LABEL[a.action] || a.action}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Clock size={11} />{dateTime(a.created_at)}</span>
                    {a.actor && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><User size={11} />{a.actor}</span>}
                  </div>
                  {a.action === 'reviewed' && a.details?.notes && (
                    <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px', fontStyle: 'italic' }}>“{a.details.notes}”</div>
                  )}
                  {a.action === 'error' && <div style={{ fontSize: '12px', color: COLORS.rose, marginTop: '4px' }}>{a.details?.error}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

export default TransactionDrawer;
