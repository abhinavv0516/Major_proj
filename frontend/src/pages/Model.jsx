import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Database, AlertTriangle, CheckCircle2, ShieldCheck, Scale, FlaskConical, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
  BarChart, Bar, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { getMetrics, getThresholdCurve, getDrivers, getValidationReport, errorMessage } from '../services/api';
import { PageHeader, Card, Stat, ErrorBanner, Loading, Empty } from '../components/ui';
import { COLORS, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, num, pct, money } from '../utils/format';

const fmt3 = (v) => (v == null ? '—' : v.toFixed(3));
const meanStd = (s) => (s ? `${s.mean.toFixed(3)} ± ${s.std.toFixed(3)}` : '—');
const ci = (c) => (c ? `95% CI ${c.low.toFixed(3)}–${c.high.toFixed(3)}` : undefined);

const Confusion = ({ tp, fp, fn, tn }) => {
  const cell = (label, value, color, hint) => (
    <div title={hint} style={{ padding: '14px', borderRadius: '12px', background: `${color}12`, border: `1px solid ${color}30`, textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color }}>{num(value)}</div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '8px', alignItems: 'center' }}>
      <span />
      <span className="label" style={{ textAlign: 'center', margin: 0 }}>Predicted fraud</span>
      <span className="label" style={{ textAlign: 'center', margin: 0 }}>Predicted legit</span>
      <span className="label" style={{ margin: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Fraud</span>
      {cell('Caught (TP)', tp, COLORS.emerald, 'Fraud correctly flagged')}
      {cell('Missed (FN)', fn, COLORS.rose, 'Fraud the model let through')}
      <span className="label" style={{ margin: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Legit</span>
      {cell('False alarm (FP)', fp, COLORS.amber, 'Legitimate transactions flagged')}
      {cell('Passed (TN)', tn, COLORS.slate, 'Legitimate transactions passed')}
    </div>
  );
};

const ThresholdTuner = ({ curve }) => {
  const points = curve.points;
  const startIdx = Math.max(0, points.findIndex((p) => p.threshold >= curve.current_threshold));
  const [idx, setIdx] = useState(startIdx);
  const p = points[Math.min(idx, points.length - 1)];
  const data = points.map((x) => ({ ...x, precision: x.precision ?? null, recall: x.recall ?? null }));

  return (
    <Card title="Threshold tuner" subtitle={`What changes if fraud is flagged at a different probability · ${num(curve.n_test)} held-out transactions, ${num(curve.n_fraud)} fraud`}>
      <div className="stack-md" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="threshold" type="number" domain={[0, 1]} tick={AXIS_TICK} tickCount={6} />
            <YAxis domain={[0, 1]} tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (v == null ? '—' : pct(v))} labelFormatter={(l) => `Threshold ${l}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={curve.current_threshold} stroke={COLORS.slate} strokeDasharray="4 4" label={{ value: 'live', fill: COLORS.slate, fontSize: 10, position: 'top' }} />
            <ReferenceLine x={p.threshold} stroke={COLORS.indigo} />
            <Line type="monotone" dataKey="precision" name="Precision" stroke={COLORS.emerald} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="recall" name="Recall" stroke={COLORS.purple} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="f1" name="F1" stroke={COLORS.amber} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <div>
          <label className="label">Threshold: <span style={{ color: 'var(--text-1)', fontSize: '15px' }}>{p.threshold.toFixed(2)}</span></label>
          <input type="range" min={0} max={points.length - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} style={{ width: '100%', accentColor: COLORS.indigo, marginBottom: '14px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {[['Recall', pct(p.recall), COLORS.purple], ['Precision', pct(p.precision), COLORS.emerald], ['Fraud caught', `${p.tp} / ${p.tp + p.fn}`, COLORS.indigo], ['Alerts raised', num(p.flagged), COLORS.amber]].map(([k, v, c]) => (
              <div key={k} style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: c }}>{v}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600 }}>{k}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.6 }}>
            Live threshold: <b>{curve.current_threshold}</b>{curve.best_f1_threshold != null && <> · best F1 on this set at <b>{curve.best_f1_threshold}</b></>}.
            The live value comes from training (chosen on cross-validation, not this test set); override with <span className="mono">FRAUD_THRESHOLD</span> in <span className="mono">backend/.env</span>.
          </p>
        </div>
      </div>
    </Card>
  );
};

const Model = () => {
  const [report, setReport] = useState(null);
  const [reportMissing, setReportMissing] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [curve, setCurve] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [r, m, c, d] = await Promise.allSettled([getValidationReport(), getMetrics(), getThresholdCurve(), getDrivers(10)]);
      if (r.status === 'fulfilled') setReport(r.value.data);
      else setReportMissing(errorMessage(r.reason, 'No validation report'));
      if (m.status === 'fulfilled') setMetrics(m.value.data);
      if (c.status === 'fulfilled') setCurve(c.value.data);
      else setError(errorMessage(c.reason, 'Could not compute the threshold curve'));
      if (d.status === 'fulfilled') setDrivers(d.value.data);
      setLoading(false);
    })();
  }, []);

  const h = report?.holdout;
  const cvRows = useMemo(() => {
    if (!report) return [];
    const hold = Object.fromEntries((report.holdout_comparison || []).map((x) => [x.model, x]));
    return Object.entries(report.cv).map(([name, r]) => ({ name, ...r.summary, seconds: r.seconds, holdout: hold[name] }));
  }, [report]);

  if (loading) return <div className="page"><Loading label="Loading model report…" /></div>;

  const ds = report?.dataset;
  const m = h?.metrics;
  const intervals = h?.confidence_intervals || {};

  return (
    <div className="page">
      <PageHeader icon={BrainCircuit} title="Model & Validation"
        subtitle={report ? `${report.selected_model} · ${report.version}` : (metrics?.model_version || 'Production model')} />

      {error && <ErrorBanner message={error} />}
      {reportMissing && (
        <div className="fade-up" style={{ display: 'flex', gap: '10px', padding: '14px 16px', borderRadius: '12px', marginBottom: '18px', background: 'var(--indigo-t)', border: '1px solid rgba(99,102,241,0.25)', fontSize: '13px', color: 'var(--text-2)' }}>
          <Info size={16} color={COLORS.indigo} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{reportMissing}. The full report (cross-validation, baselines, confidence intervals, calibration) is produced by
            <span className="mono"> python ml-model/train.py</span>. Threshold analysis below uses the current model.</span>
        </div>
      )}

      {ds?.synthetic && (
        <div className="fade-up" style={{ display: 'flex', gap: '10px', padding: '14px 16px', borderRadius: '12px', marginBottom: '18px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '13px', color: 'var(--text-2)' }}>
          <AlertTriangle size={16} color={COLORS.amber} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>This model was trained on the <b>synthetic sample</b>, so these numbers say nothing about real fraud. Run
            <span className="mono"> python dataset/download_creditcard.py</span> then <span className="mono">python ml-model/train.py</span> to train on the real ULB dataset.</span>
        </div>
      )}

      {report && (
        <>
          {/* Dataset + protocol */}
          <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Card title="Dataset" action={<Database size={16} color={COLORS.indigo} />}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{ds.name}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: '4px 0 12px', lineHeight: 1.5 }}>{ds.source}{ds.citation && <><br /><i>{ds.citation}</i></>}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[['Transactions', num(ds.rows)], ['Fraud cases', num(ds.fraud)], ['Fraud rate', pct(ds.prevalence, 3)],
                  ['Duplicates removed', num(ds.duplicates_removed)], ['Train / holdout', `${num(report.split.train_rows)} / ${num(report.split.holdout_rows)}`], ['Holdout fraud', num(report.split.holdout_fraud)]].map(([k, v]) => (
                  <div key={k} style={{ padding: '9px 10px', borderRadius: '10px', background: 'var(--bg-input)' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-1)' }}>{v}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Validation protocol" action={<ShieldCheck size={16} color={COLORS.emerald} />}>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-2)' }}>
                {[
                  report.split.strategy === 'temporal'
                    ? `Out-of-time holdout: trained on earlier transactions, tested on the last ${pct(report.split.test_size, 0)}`
                    : `Stratified random holdout of ${pct(report.split.test_size, 0)}`,
                  `${report.protocol.cv_folds}-fold stratified cross-validation on the training part only`,
                  report.protocol.preprocessing,
                  report.protocol.threshold,
                  `Leakage check: ${report.sanity_checks.rows_in_both_splits} identical rows in both splits; shuffled-label PR-AUC ${fmt3(report.sanity_checks.shuffled_label_pr_auc)} vs fraud rate ${fmt3(report.sanity_checks.holdout_prevalence)}`,
                ].map((t) => (
                  <li key={t} style={{ display: 'flex', gap: '8px' }}><CheckCircle2 size={15} color={COLORS.emerald} style={{ flexShrink: 0, marginTop: '2px' }} />{t}</li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Headline holdout metrics */}
          <div className="grid-kpi fade-up" style={{ marginBottom: '16px' }}>
            <Stat label="PR-AUC (holdout)" value={fmt3(m.pr_auc)} sub={ci(intervals.pr_auc)} color={COLORS.indigo} />
            <Stat label="ROC-AUC" value={fmt3(m.roc_auc)} sub={ci(intervals.roc_auc)} color={COLORS.cyan} />
            <Stat label="Recall" value={pct(m.recall)} sub={ci(intervals.recall)} color={COLORS.purple} />
            <Stat label="Precision" value={pct(m.precision)} sub={ci(intervals.precision)} color={COLORS.emerald} />
            <Stat label="Fraud value caught" value={pct(h.cost.share_of_fraud_amount_caught)} sub={`${money(h.cost.fraud_amount_caught)} of ${money(h.cost.fraud_amount_total)}`} color={COLORS.amber} />
          </div>

          {/* Model comparison */}
          <Card title="Model comparison" subtitle="Cross-validated on the training part (mean ± std), then scored once on the holdout" style={{ marginBottom: '16px' }} action={<Scale size={16} color={COLORS.indigo} />}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Model</th><th>CV PR-AUC</th><th>CV ROC-AUC</th><th>CV recall @0.5</th><th>CV precision @0.5</th><th>Holdout PR-AUC</th><th>Holdout recall / precision</th><th>CV time</th></tr>
                </thead>
                <tbody>
                  {cvRows.map((r) => {
                    const selected = r.name === report.selected_model;
                    return (
                      <tr key={r.name} style={selected ? { background: 'var(--indigo-t)' } : undefined}>
                        <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{r.name}{selected && <span style={{ marginLeft: '6px', fontSize: '10px', color: COLORS.indigo, fontWeight: 800 }}>PRODUCTION</span>}</td>
                        <td className="mono">{meanStd(r.pr_auc)}</td>
                        <td className="mono">{meanStd(r.roc_auc)}</td>
                        <td className="mono">{meanStd(r.recall)}</td>
                        <td className="mono">{meanStd(r.precision)}</td>
                        <td className="mono" style={{ fontWeight: 700 }}>{fmt3(r.holdout?.pr_auc)}</td>
                        <td className="mono">{r.holdout ? `${pct(r.holdout.recall, 0)} / ${pct(r.holdout.precision, 0)} @${r.holdout.threshold}` : '—'}</td>
                        <td className="mono">{r.seconds}s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '10px', lineHeight: 1.6 }}>
              PR-AUC is the headline metric: with a {pct(ds.prevalence, 2)} fraud rate, a model that never flags anything already has {pct(1 - ds.prevalence, 2)} accuracy.
              Production uses XGBoost because the API explains each decision with its built-in TreeSHAP.
            </p>
          </Card>

          {/* Curves */}
          <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Card title="Precision–recall curve" subtitle={`Holdout · AP ${fmt3(m.pr_auc)}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={h.curves.pr} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="recall" type="number" domain={[0, 1]} tick={AXIS_TICK} tickCount={6} />
                  <YAxis domain={[0, 1]} tick={AXIS_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt3(v)} labelFormatter={(l) => `Recall ${fmt3(l)}`} />
                  <ReferenceLine y={ds.prevalence} stroke={COLORS.slate} strokeDasharray="4 4" />
                  <Line type="stepAfter" dataKey="precision" stroke={COLORS.indigo} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card title="ROC curve" subtitle={`Holdout · AUC ${fmt3(m.roc_auc)}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={h.curves.roc} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="fpr" type="number" domain={[0, 1]} tick={AXIS_TICK} tickCount={6} />
                  <YAxis domain={[0, 1]} tick={AXIS_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt3(v)} labelFormatter={(l) => `False-positive rate ${fmt3(l)}`} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={COLORS.slate} strokeDasharray="4 4" />
                  <Line type="linear" dataKey="tpr" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Calibration" subtitle={`Do predicted probabilities match reality? · Brier ${h.calibration.brier_score.toFixed(4)}`}>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="mean_predicted" type="number" domain={[0, 1]} tick={AXIS_TICK} tickCount={6} name="Predicted" />
                  <YAxis dataKey="fraction_fraud" type="number" domain={[0, 1]} tick={AXIS_TICK} name="Observed" />
                  <ZAxis range={[50, 50]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt3(v)} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={COLORS.slate} strokeDasharray="4 4" />
                  <Scatter data={h.calibration.bins} fill={COLORS.purple} line={{ stroke: COLORS.purple }} />
                </ScatterChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}

      {/* Threshold + confusion */}
      {curve && (
        <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <ThresholdTuner curve={curve} />
          <Card title="Confusion matrix" subtitle={`Holdout at the live threshold (${curve.current_threshold})`}>
            <Confusion {...curve.current} />
            {h && (
              <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '12px', lineHeight: 1.6 }}>
                {num(h.cost.alerts_per_1000_transactions, 1)} alerts per 1,000 transactions · {money(h.cost.fraud_amount_missed)} of fraud missed
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Global explanations */}
      <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Card title="What drives the model (holdout)" subtitle="Mean |SHAP| per feature over the test set">
          {report?.feature_importance?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={report.feature_importance.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} />
                <YAxis type="category" dataKey="feature" tick={AXIS_TICK} width={52} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt3(v)} />
                <Bar dataKey="mean_abs_shap" name="Mean |SHAP|" fill={COLORS.indigo} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty title="Available after training with ml-model/train.py" />}
        </Card>
        <Card title="What drives live decisions" subtitle="Mean |SHAP| over stored transactions: all vs. flagged">
          {drivers.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={drivers} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} />
                <YAxis type="category" dataKey="feature" tick={AXIS_TICK} width={52} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt3(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="mean_abs_shap" name="All" fill={COLORS.slate} radius={[0, 4, 4, 0]} />
                <Bar dataKey="mean_abs_shap_flagged" name="Flagged" fill={COLORS.rose} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty icon={FlaskConical} title="No scored transactions yet">Simulate traffic from the dashboard.</Empty>}
        </Card>
      </div>
    </div>
  );
};

export default Model;
