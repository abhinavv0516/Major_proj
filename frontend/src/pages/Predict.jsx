import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ShieldAlert, ShieldCheck, Shuffle, Save, Info, ChevronRight, Layers, FileSpreadsheet } from 'lucide-react';
import { predictFraud, createTransaction, getSampleTransaction, getModelInfo, errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import ShapBars from '../components/ShapBars';
import BatchScoring from '../components/BatchScoring';
import { PageHeader, Card, RiskBadge, Empty } from '../components/ui';
import { COLORS, RISK, FEATURES, money, pct } from '../utils/format';

const blank = () => Object.fromEntries(FEATURES.map((f) => [f, 0]));

const RiskGauge = ({ probability, level }) => {
  const color = RISK[level]?.color || COLORS.slate;
  const r = 70, cx = 90, cy = 90, start = -210, sweep = 240;
  const rad = (d) => (d * Math.PI) / 180;
  const arc = (p) => {
    const end = start + sweep * Math.min(Math.max(p, 0.0001), 0.9999);
    const [x1, y1] = [cx + r * Math.cos(rad(start)), cy + r * Math.sin(rad(start))];
    const [x2, y2] = [cx + r * Math.cos(rad(end)), cy + r * Math.sin(rad(end))];
    return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep * p > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="180" height="140" viewBox="0 0 180 140">
        <path d={arc(1)} fill="none" stroke="var(--bg-input)" strokeWidth="12" strokeLinecap="round" style={{ stroke: 'var(--border-2)' }} />
        <path d={arc(probability)} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" style={{ transition: 'all .8s ease', filter: `drop-shadow(0 0 6px ${color}66)` }} />
        <text x="90" y="96" textAnchor="middle" fill={color} fontSize="26" fontWeight="800">{(probability * 100).toFixed(1)}%</text>
        <text x="90" y="115" textAnchor="middle" fill={COLORS.slate} fontSize="10" fontWeight="600">FRAUD PROBABILITY</text>
      </svg>
      <RiskBadge level={level} />
    </div>
  );
};

const SingleScoring = () => {
  const { addToast } = useToast();
  const [form, setForm] = useState(blank);
  const [sampleLabel, setSampleLabel] = useState(null);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    getModelInfo().then(({ data }) => setInfo(data)).catch(() => {});
    loadSample('legit');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSample = async (label) => {
    try {
      const { data } = await getSampleTransaction(label);
      setForm(data);
      setSampleLabel(label);
      setResult(null);
      setSavedId(null);
    } catch (err) {
      addToast(errorMessage(err, 'Could not load a sample'), 'error', 5000);
    }
  };

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v === '' ? '' : Number(v) }));
    setSampleLabel(null);
  };

  const analyze = async () => {
    setBusy(true);
    setSavedId(null);
    try {
      const payload = Object.fromEntries(FEATURES.map((f) => [f, Number(form[f]) || 0]));
      const { data } = await predictFraud(payload, true);
      setResult({ ...data, features: payload });
      addToast(data.is_fraud ? `Flagged: ${pct(data.fraud_probability)} fraud probability` : `Looks legitimate (${pct(data.fraud_probability)})`, data.is_fraud ? 'fraud' : 'success', 4000);
    } catch (err) {
      addToast(errorMessage(err, 'Scoring failed'), 'error', 6000);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    try {
      const { data } = await createTransaction(result.features);
      setSavedId(data.id);
      addToast(`Saved as transaction #${data.id}`, 'info', 3000);
    } catch (err) {
      addToast(errorMessage(err, 'Could not save'), 'error', 5000);
    }
  };

  return (
    <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '18px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Card title="Load a real transaction" subtitle="Random rows from the held-out test set (never used in training)">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-success" onClick={() => loadSample('legit')}><Shuffle size={14} /> Legitimate sample</button>
            <button className="btn btn-danger" onClick={() => loadSample('fraud')}><Shuffle size={14} /> Known fraud sample</button>
            <button className="btn" onClick={() => { setForm(blank()); setSampleLabel(null); setResult(null); }}>Clear</button>
            {sampleLabel && <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Loaded a <b style={{ color: sampleLabel === 'fraud' ? COLORS.rose : COLORS.emerald }}>{sampleLabel === 'fraud' ? 'fraud' : 'legitimate'}</b> case — will the model agree?</span>}
          </div>
        </Card>

        <Card title="Transaction features">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[['time', 'Time (s since first transaction)'], ['amount', 'Amount']].map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input className="input" type="number" step="any" value={form[k]} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span className="label" style={{ margin: 0 }}>PCA components V1–V28</span>
            <span title="The public dataset anonymises card features with PCA" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--indigo)' }}><Info size={12} /> anonymised</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: '8px' }}>
            {FEATURES.filter((f) => f.startsWith('v')).map((k) => (
              <div key={k}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-3)', textAlign: 'center', marginBottom: '3px' }}>{k.toUpperCase()}</label>
                <input className="input mono" type="number" step="any" value={form[k]} onChange={(e) => set(k, e.target.value)} style={{ textAlign: 'center', padding: '6px 4px', fontSize: '11px' }} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button className="btn btn-primary" style={{ padding: '15px', fontSize: '15px', borderRadius: '14px' }} onClick={analyze} disabled={busy}>
          {busy ? <><span className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Scoring…</> : <><Zap size={18} /> Score transaction <ChevronRight size={15} /></>}
        </button>

        {result ? (
          <>
            <Card accent={result.is_fraud ? COLORS.rose : COLORS.emerald}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                {result.is_fraud ? <ShieldAlert size={18} color={COLORS.rose} /> : <ShieldCheck size={18} color={COLORS.emerald} />}
                <b style={{ color: result.is_fraud ? COLORS.rose : COLORS.emerald }}>{result.is_fraud ? 'Flagged as fraud' : 'Legitimate'}</b>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: '11px' }}>{result.inference_ms} ms</span>
              </div>
              <RiskGauge probability={result.fraud_probability} level={result.risk_level} />
              <div style={{ fontSize: '12px', color: 'var(--text-3)', textAlign: 'center', marginTop: '10px' }}>
                Decision threshold {result.threshold} · {result.model_version} · amount {money(result.features.amount)}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                {savedId ? (
                  <Link to="/transactions" className="btn btn-success" style={{ flex: 1 }}>Saved as #{savedId} — view</Link>
                ) : (
                  <button className="btn" style={{ flex: 1 }} onClick={save}><Save size={14} /> Save to transaction log</button>
                )}
              </div>
            </Card>
            <Card title="Why?" subtitle="Feature contributions for this decision">
              <ShapBars values={result.shap_values} features={result.features} limit={10} />
            </Card>
          </>
        ) : (
          <Card><Empty icon={Zap} title="Result will appear here">Load a sample or edit the features, then score it.</Empty></Card>
        )}

        {info && (
          <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.6 }}>
            Model <b>{info.model_version || '—'}</b> · flags at ≥ {info.threshold ?? '—'} · high risk at ≥ {info.high_risk_threshold ?? '—'}
            {!info.loaded && <span style={{ color: COLORS.rose }}> · not loaded: {info.error}</span>}
          </p>
        )}
      </div>
    </div>
  );
};

const Predict = () => {
  const [tab, setTab] = useState('single');
  return (
    <div className="page">
      <PageHeader icon={Zap} title="Live Analyzer" subtitle="Score transactions with the production model and see why it decided">
        <div className="seg">
          <button className={tab === 'single' ? 'active' : ''} onClick={() => setTab('single')}><Layers size={12} style={{ verticalAlign: '-2px' }} /> Single</button>
          <button className={tab === 'batch' ? 'active' : ''} onClick={() => setTab('batch')}><FileSpreadsheet size={12} style={{ verticalAlign: '-2px' }} /> Batch CSV</button>
        </div>
      </PageHeader>
      {tab === 'single' ? <SingleScoring /> : <BatchScoring />}
    </div>
  );
};

export default Predict;
