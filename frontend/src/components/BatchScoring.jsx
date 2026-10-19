import { useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, Zap } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, Stat, RiskBadge, ProbBar, Empty } from './ui';
import { COLORS, FEATURES, num, pct, money } from '../utils/format';

const CHUNK = 5000;
const clock = () => performance.now();      // backend limit per request
const MAX_ROWS = 100000; // keep the browser responsive

/** Parse a numeric CSV with a header row. Returns { rows, labels, error }. */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: 'The file has no data rows.' };
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const missing = FEATURES.filter((f) => !(f in idx));
  if (missing.length) return { error: `Missing columns: ${missing.join(', ')} (expected Time, V1..V28, Amount)` };
  const labelIdx = idx.class;

  const rows = [];
  const labels = [];
  for (const line of lines.slice(1, MAX_ROWS + 1)) {
    const cells = line.split(',');
    const row = {};
    for (const f of FEATURES) row[f] = Number(cells[idx[f]]);
    if (Object.values(row).some((v) => !Number.isFinite(v))) continue;
    rows.push(row);
    if (labelIdx != null) labels.push(Number(cells[labelIdx]) === 1 ? 1 : 0);
  }
  return { rows, labels: labelIdx != null ? labels : null, truncated: lines.length - 1 > MAX_ROWS, header };
}

/**
 * Batch scoring: upload a CSV, score every row with POST /api/predict/batch (in chunks of 5,000),
 * and, if the file has a Class column, measure precision/recall on it right away.
 */
const BatchScoring = () => {
  const { addToast } = useToast();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const parsed = parseCsv(await file.text());
    if (parsed.error) { addToast(parsed.error, 'error', 6000); return; }
    if (!parsed.rows.length) { addToast('No valid numeric rows found.', 'error', 5000); return; }
    if (parsed.truncated) addToast(`Only the first ${num(MAX_ROWS)} rows are scored in the browser.`, 'info', 5000);

    setBusy(true);
    setProgress(0);
    const scored = [];
    let modelMs = 0;
    const started = clock();
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const { data } = await api.post('/predict/batch', { transactions: parsed.rows.slice(i, i + CHUNK) });
        modelMs += data.elapsed_ms;
        data.results.forEach((r) => scored.push({ ...r, index: r.index + i }));
        setProgress(Math.min(1, (i + CHUNK) / parsed.rows.length));
        if (i + CHUNK >= parsed.rows.length) {
          finish(parsed, scored, { modelMs, wallMs: clock() - started, threshold: data.threshold, version: data.model_version });
        }
      }
    } catch (err) {
      addToast(errorMessage(err, 'Batch scoring failed'), 'error', 6000);
    } finally {
      setBusy(false);
    }
  };

  const finish = (parsed, scored, meta) => {
    const flagged = scored.filter((r) => r.is_fraud).length;
    let perf = null;
    if (parsed.labels) {
      let tp = 0, fp = 0, fn = 0, tn = 0;
      scored.forEach((r, i) => {
        const y = parsed.labels[i];
        if (r.is_fraud) (y ? tp++ : fp++); else (y ? fn++ : tn++);
      });
      perf = {
        tp, fp, fn, tn,
        precision: tp + fp ? tp / (tp + fp) : null,
        recall: tp + fn ? tp / (tp + fn) : null,
        accuracy: (tp + tn) / scored.length,
      };
    }
    const top = [...scored].sort((a, b) => b.fraud_probability - a.fraud_probability).slice(0, 15)
      .map((r) => ({ ...r, amount: parsed.rows[r.index].amount, label: parsed.labels?.[r.index] }));
    setResult({ parsed, scored, flagged, perf, top, ...meta });
  };

  const download = () => {
    const { parsed, scored } = result;
    const cols = [...FEATURES, ...(parsed.labels ? ['class'] : []), 'fraud_probability', 'is_fraud', 'risk_level'];
    const lines = scored.map((r) => [
      ...FEATURES.map((f) => parsed.rows[r.index][f]),
      ...(parsed.labels ? [parsed.labels[r.index]] : []),
      r.fraud_probability.toFixed(6), r.is_fraud ? 1 : 0, r.risk_level,
    ].join(','));
    const blob = new Blob([[cols.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/\.csv$/i, '') + '_scored.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card title="Batch scoring" subtitle="Score a whole CSV in one go. Rows are not stored.">
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <><span className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Scoring {pct(progress, 0)}</> : <><Upload size={15} /> Upload CSV</>}
          </button>
          {fileName && <span style={{ fontSize: '13px', color: 'var(--text-2)', display: 'inline-flex', gap: '6px', alignItems: 'center' }}><FileSpreadsheet size={14} />{fileName}</span>}
          {result && <button className="btn" onClick={download}><Download size={14} /> Download scored CSV</button>}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '12px', lineHeight: 1.6 }}>
          Columns: <span className="mono">Time, V1…V28, Amount</span> (any order, header required). Add a{' '}
          <span className="mono">Class</span> column (1 = fraud) to see precision and recall on your file —
          try <span className="mono">dataset/sample_creditcard.csv</span> or the real <span className="mono">creditcard.csv</span>.
        </p>
      </Card>

      {result && (
        <>
          <div className="grid-kpi">
            <Stat icon={FileSpreadsheet} label="Rows scored" value={num(result.scored.length)} color={COLORS.indigo} sub={result.version} />
            <Stat icon={Zap} label="Throughput" value={`${num(result.scored.length / (result.modelMs / 1000))}/s`} sub={`model ${num(result.modelMs)} ms · total ${num(result.wallMs)} ms`} color={COLORS.cyan} />
            <Stat label="Flagged" value={num(result.flagged)} sub={`${pct(result.flagged / result.scored.length, 2)} at threshold ${result.threshold}`} color={COLORS.rose} />
            {result.perf && <Stat label="Recall / Precision" value={`${pct(result.perf.recall, 0)} / ${pct(result.perf.precision, 0)}`} sub={`${result.perf.tp} caught · ${result.perf.fn} missed · ${result.perf.fp} false alarms`} color={COLORS.emerald} />}
          </div>

          <Card title="Highest-risk rows" subtitle="Top 15 by fraud probability">
            {result.top.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Row</th><th>Amount</th><th>Probability</th><th>Risk</th>{result.perf && <th>True label</th>}</tr></thead>
                  <tbody>
                    {result.top.map((r) => (
                      <tr key={r.index}>
                        <td className="mono">{r.index + 1}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{money(r.amount)}</td>
                        <td><ProbBar value={r.fraud_probability} level={r.risk_level} /></td>
                        <td><RiskBadge level={r.risk_level} /></td>
                        {result.perf && <td style={{ color: r.label ? COLORS.rose : 'var(--text-2)', fontWeight: 600 }}>{r.label ? 'Fraud' : 'Legit'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="No rows" />}
          </Card>
        </>
      )}
    </div>
  );
};

export default BatchScoring;
