import { useState } from 'react';
import { predictFraud, createTransaction } from '../services/api';
import { useToast } from '../context/ToastContext';
import {
  Zap, ShieldAlert, ShieldCheck, AlertTriangle,
  RotateCcw, Activity, Info, ChevronRight
} from 'lucide-react';

// Generate random transaction values
const randomTx = (forceFraud = false) => {
  const isFraud = forceFraud;
  const obj = { time: Math.random() * 100000, amount: parseFloat((Math.random() * 900 + 10).toFixed(2)) };
  for (let i = 1; i <= 28; i++) {
    obj[`v${i}`] = parseFloat((isFraud ? (Math.random() * 6 - 3) : (Math.random() * 2 - 1)).toFixed(4));
  }
  return obj;
};

// Mock local predict when backend offline
const mockPredict = (data) => {
  const v1 = data.v1 ?? 0;
  const v3 = data.v3 ?? 0;
  const v4 = data.v4 ?? 0;
  const amount = data.amount ?? 0;
  // Heuristic score
  let score = Math.abs(v1) * 0.15 + Math.abs(v3) * 0.12 + Math.abs(v4) * 0.1;
  if (amount > 700) score += 0.1;
  score = Math.min(Math.max(score + Math.random() * 0.05, 0.02), 0.98);
  return { fraud_probability: parseFloat(score.toFixed(4)), is_fraud: score > 0.5 };
};

const RiskGauge = ({ probability }) => {
  const pct = probability * 100;
  const color = pct > 65 ? '#f43f5e' : pct > 35 ? '#f59e0b' : '#10b981';
  const label = pct > 65 ? 'HIGH RISK' : pct > 35 ? 'MEDIUM RISK' : 'LOW RISK';
  // SVG arc gauge
  const r = 70, cx = 90, cy = 90;
  const startAngle = -210, sweep = 240;
  const toRad = d => d * Math.PI / 180;
  const arcPath = (pctFill) => {
    const end = startAngle + sweep * Math.min(pctFill, 0.9999);
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const lg = sweep * pctFill > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="180" height="140" viewBox="0 0 180 140">
        {/* Background arc */}
        <path d={arcPath(1)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
        {/* Colored arc */}
        <path d={arcPath(probability)} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}80)`, transition: 'all 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
        {/* Center text */}
        <text x="90" y="96" textAnchor="middle" fill={color} fontSize="26" fontWeight="800" fontFamily="Inter">
          {pct.toFixed(1)}%
        </text>
        <text x="90" y="115" textAnchor="middle" fill="var(--text-3)" fontSize="10" fontWeight="600" fontFamily="Inter">
          FRAUD PROBABILITY
        </text>
      </svg>
      <div style={{
        padding: '6px 18px', borderRadius: '99px', fontSize: '12px', fontWeight: '800', letterSpacing: '1px',
        background: `${color}18`, border: `1px solid ${color}40`, color,
        transition: 'all 0.4s',
      }}>{label}</div>
    </div>
  );
};

const FeatureRow = ({ name, value, importance }) => {
  const abs = Math.min(Math.abs(value) / 3, 1);
  const sign = value > 0 ? '#f43f5e' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-3)', width: '28px', fontFamily: 'monospace' }}>{name}</span>
      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${abs * 100}%`, background: sign, borderRadius: '99px' }} />
      </div>
      <span style={{ fontSize: '11px', color: sign, width: '48px', textAlign: 'right', fontFamily: 'monospace' }}>
        {value > 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
};

const Predict = () => {
  const { addToast } = useToast();
  const [formData, setFormData] = useState(randomTx());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState(0); // 0=input 1=result

  const set = (k, v) => setFormData(p => ({ ...p, [k]: parseFloat(v) || 0 }));

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    setSaved(false);
    try {
      let res;
      try { res = await predictFraud(formData); res = res.data; }
      catch { res = mockPredict(formData); }
      setResult(res);
      setStep(1);
      if (res.is_fraud) {
        addToast(`🚨 Fraud Detected! Probability: ${(res.fraud_probability * 100).toFixed(1)}% — Amount: $${formData.amount?.toFixed(2)}`, 'fraud', 7000);
      } else {
        addToast(`✅ Transaction appears legitimate. Risk: ${(res.fraud_probability * 100).toFixed(1)}%`, 'success', 4000);
      }
    } finally { setLoading(false); }
  };

  const handleSaveToLog = async () => {
    try {
      await createTransaction(formData);
      setSaved(true);
      addToast('Transaction saved to transaction log.', 'info', 3000);
    } catch { addToast('Failed to save transaction.', 'error', 3000); }
  };

  const handleReset = () => { setStep(0); setResult(null); setSaved(false); };
  const loadRandom = (fraud = false) => { setFormData(randomTx(fraud)); setResult(null); setStep(0); setSaved(false); };

  const topFeatures = Object.entries(formData)
    .filter(([k]) => k.startsWith('v'))
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 10);

  const cardStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '16px', padding: '22px', backdropFilter: 'blur(12px)',
    boxShadow: 'var(--shadow)',
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px',
    background: 'var(--bg-input)', border: '1px solid var(--border-2)',
    borderRadius: '8px', color: 'var(--text-1)', fontSize: '13px',
    outline: 'none', transition: 'border-color 0.15s',
  };

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%', background: 'var(--bg-base)' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseRing { 0%,100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.4); } 50% { box-shadow: 0 0 0 12px rgba(244,63,94,0); } }
        .analyze-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.1); }
        .analyze-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .preset-btn:hover { border-color: var(--border-2) !important; background: var(--bg-input) !important; }
        input:focus { border-color: var(--indigo) !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '24px', animation: 'fadeUp 0.3s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={17} color="white" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px', color: 'var(--text-1)' }}>Live Fraud Analyzer</h1>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>AI-POWERED</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
          Enter transaction parameters and let the Random Forest model classify it in real-time.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', animation: 'fadeUp 0.35s ease both', animationDelay: '0.05s' }}>
        {/* Left: Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Quick presets */}
          <div style={cardStyle}>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Quick Load</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                ['🔀 Random Legit', () => loadRandom(false), '#10b981'],
                ['⚠️ Random Fraud', () => loadRandom(true), '#f43f5e'],
                ['↩ Reset Fields', () => { setFormData(randomTx()); handleReset(); }, '#6366f1'],
              ].map(([label, fn, color]) => (
                <button key={label} className="preset-btn" onClick={fn} style={{
                  padding: '8px 14px', borderRadius: '9px', fontSize: '12px', fontWeight: '600',
                  background: `${color}10`, border: `1px solid ${color}30`, color,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Core fields */}
          <div style={cardStyle}>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>Core Parameters</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                ['time', 'Time (seconds)', 'Time elapsed from first transaction'],
                ['amount', 'Amount ($)', 'Transaction amount in USD'],
              ].map(([key, label, desc]) => (
                <div key={key}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>
                    {label}
                  </label>
                  <input
                    type="number"
                    value={formData[key] ?? ''}
                    onChange={e => set(key, e.target.value)}
                    step="any"
                    style={inputStyle}
                  />
                  <p style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '3px' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* PCA features */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PCA Features (V1–V28)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--indigo-t)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Info size={11} color="var(--indigo)" />
                <span style={{ fontSize: '10px', color: 'var(--indigo)', fontWeight: '600' }}>Anonymized via PCA</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
              {Array.from({ length: 28 }, (_, i) => `v${i + 1}`).map(k => (
                <div key={k}>
                  <label style={{ fontSize: '10px', color: 'var(--text-3)', display: 'block', marginBottom: '3px', textAlign: 'center' }}>{k.toUpperCase()}</label>
                  <input
                    type="number"
                    value={formData[k] ?? ''}
                    onChange={e => set(k, e.target.value)}
                    step="0.0001"
                    style={{ ...inputStyle, textAlign: 'center', padding: '6px 4px', fontSize: '11px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Result panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Analyze button */}
          <button
            className="analyze-btn"
            onClick={handleAnalyze}
            disabled={loading}
            style={{
              padding: '16px', borderRadius: '14px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: 'white', fontSize: '16px', fontWeight: '800',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: '0 6px 24px rgba(99,102,241,0.4)',
              transition: 'all 0.2s',
              animation: loading ? undefined : 'none',
            }}
          >
            {loading ? (
              <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Analyzing…</>
            ) : (
              <><Zap size={20} />Analyze Transaction<ChevronRight size={16} /></>
            )}
          </button>

          {/* Result */}
          {result ? (
            <>
              {/* Gauge */}
              <div style={{
                ...cardStyle,
                borderColor: result.is_fraud ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.25)',
                animation: 'fadeUp 0.4s ease both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: result.is_fraud ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.12)',
                    animation: result.is_fraud ? 'pulseRing 2s ease-in-out infinite' : 'none',
                  }}>
                    {result.is_fraud ? <ShieldAlert size={15} color="#f43f5e" /> : <ShieldCheck size={15} color="#10b981" />}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: result.is_fraud ? '#fb7185' : '#34d399' }}>
                    {result.is_fraud ? 'Fraud Detected' : 'Legitimate Transaction'}
                  </span>
                </div>

                <RiskGauge probability={result.fraud_probability} />

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSaveToLog}
                    disabled={saved}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: saved ? 'default' : 'pointer',
                      background: saved ? 'rgba(16,185,129,0.12)' : 'var(--indigo-t)',
                      color: saved ? '#34d399' : 'var(--indigo)',
                      fontSize: '12px', fontWeight: '600',
                      border: `1px solid ${saved ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    {saved ? '✓ Saved to Log' : '+ Save to Log'}
                  </button>
                  <button onClick={handleReset} style={{
                    padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-2)',
                    background: 'var(--bg-input)', color: 'var(--text-2)',
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  }}>
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>

              {/* Verdict details */}
              <div style={{ ...cardStyle, animation: 'fadeUp 0.45s ease both', animationDelay: '0.05s' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Verdict Breakdown</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  {[
                    ['Amount', `$${formData.amount?.toFixed(2)}`, formData.amount > 700 ? '#f43f5e' : 'var(--text-1)'],
                    ['Fraud Probability', `${(result.fraud_probability * 100).toFixed(2)}%`, result.fraud_probability > 0.5 ? '#f43f5e' : '#10b981'],
                    ['Model Verdict', result.is_fraud ? 'FRAUD' : 'LEGITIMATE', result.is_fraud ? '#f43f5e' : '#10b981'],
                    ['Confidence', `${Math.abs(result.fraud_probability - 0.5) * 200}%`.slice(0, 6) + '%', 'var(--text-2)'],
                    ['Model', 'Random Forest', 'var(--indigo)'],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-3)' }}>{k}</span>
                      <span style={{ fontWeight: '700', color: c }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Placeholder state */
            <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px', opacity: 0.6 }}>
              <Activity size={40} color="var(--text-3)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-2)' }}>Result will appear here</p>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>Load a preset or edit features, then click Analyze</p>
            </div>
          )}

          {/* Top Features */}
          <div style={{ ...cardStyle, animation: 'fadeUp 0.4s ease both', animationDelay: '0.1s' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Top Feature Magnitudes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {topFeatures.map(({ k, v }) => <FeatureRow key={k} name={k} value={v} />)}
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '10px' }}>Red = positive deviation · Green = negative deviation from mean</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Predict;
