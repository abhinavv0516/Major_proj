import { useEffect, useState, useCallback } from 'react';
import { getAnalytics, getMetrics, getTransactions } from '../services/api';
import {
  ShieldAlert, ShieldCheck, Activity, Database, TrendingUp, TrendingDown,
  RefreshCw, Clock, Zap, AlertTriangle, BarChart2, Target, Award
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, RadialBarChart, RadialBar, Legend
} from 'recharts';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString() ?? '—';
const pct = (n) => n != null ? `${Number(n).toFixed(2)}%` : '—';

const StatCard = ({ icon: Icon, label, value, sub, color, trend, trendVal }) => (
  <div style={{
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '16px', padding: '20px 22px',
    backdropFilter: 'blur(12px)', position: 'relative', overflow: 'hidden',
  }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: color, borderRadius: '16px 16px 0 0' }} />
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</p>
        <p style={{ fontSize: '30px', fontWeight: '800', color: 'var(--text-1)', lineHeight: 1, marginBottom: '6px' }}>{value}</p>
        {sub && <p style={{ fontSize: '12px', color: 'var(--text-2)' }}>{sub}</p>}
        {trendVal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
            {trend === 'up' ? <TrendingUp size={13} color="#10b981" /> : <TrendingDown size={13} color="#f43f5e" />}
            <span style={{ fontSize: '12px', color: trend === 'up' ? '#10b981' : '#f43f5e', fontWeight: '600' }}>{trendVal}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>vs last week</span>
          </div>
        )}
      </div>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
        background: `${color}18`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={color} />
      </div>
    </div>
  </div>
);

const MetricBar = ({ label, value, color, description }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
      <div>
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)' }}>{label}</span>
        {description && <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{description}</p>}
      </div>
      <span style={{ fontSize: '15px', fontWeight: '800', color }}>{pct(value * 100)}</span>
    </div>
    <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${value * 100}%`, borderRadius: '99px',
        background: `linear-gradient(90deg, ${color}aa, ${color})`,
        transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: `0 0 8px ${color}60`,
      }} />
    </div>
  </div>
);

const COLORS_PIE = ['#10b981', '#f43f5e'];
const CUSTOM_TOOLTIP_STYLE = {
  background: '#1a2236', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px', padding: '10px 14px', color: '#f0f4ff', fontSize: '13px',
};

const Dashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [aRes, mRes, tRes] = await Promise.all([getAnalytics(), getMetrics(), getTransactions(0, 50)]);
      setAnalytics(aRes.data);
      setMetrics(mRes.data);
      setTransactions(tRes.data || []);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(); };

  // Build daily bar chart data from transactions
  const dailyData = (() => {
    const map = {};
    transactions.forEach(t => {
      const d = new Date(t.created_at);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!map[key]) map[key] = { date: key, legit: 0, fraud: 0 };
      t.is_fraud ? map[key].fraud++ : map[key].legit++;
    });
    return Object.values(map).slice(-7);
  })();

  // Amount distribution for area chart
  const amountData = [...transactions]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-20)
    .map((t, i) => ({ i: i + 1, amount: t.amount, fraud: t.is_fraud ? t.amount : 0 }));

  const pieData = analytics ? [
    { name: 'Legitimate', value: analytics.legitimate_transactions },
    { name: 'Fraudulent', value: analytics.fraud_transactions },
  ] : [];

  const rf = metrics?.['Random Forest'];
  const recentFraud = transactions.filter(t => t.is_fraud).slice(0, 5);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>Loading dashboard…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%', background: 'var(--bg-base)' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .dash-section { animation: fadeUp 0.4s ease both; }
      `}</style>

      {/* Header */}
      <div className="dash-section" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-1)', letterSpacing: '-0.5px' }}>Dashboard Overview</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '4px' }}>Real-time fraud analytics · AI model performance · Transaction monitoring</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <Clock size={13} color="var(--text-3)" />
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{lastRefresh.toLocaleTimeString()}</span>
          </div>
          <button onClick={handleRefresh} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '10px', color: '#818cf8', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dash-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px', animationDelay: '0.05s' }}>
        <StatCard icon={Database} label="Total Transactions" value={fmt(analytics?.total_transactions)} sub="All time recorded" color="#6366f1" trend="up" trendVal="+12%" />
        <StatCard icon={ShieldCheck} label="Legitimate" value={fmt(analytics?.legitimate_transactions)} sub={`${pct(100 - analytics?.fraud_percentage)} of total`} color="#10b981" trend="up" trendVal="+8%" />
        <StatCard icon={ShieldAlert} label="Fraud Detected" value={fmt(analytics?.fraud_transactions)} sub="Flagged by AI model" color="#f43f5e" trend="down" trendVal="-3%" />
        <StatCard icon={Activity} label="Fraud Rate" value={pct(analytics?.fraud_percentage)} sub="Current period" color="#f59e0b" trend="down" trendVal="-1.2%" />
      </div>

      {/* Row 2: Area Chart + Pie + Alert */}
      <div className="dash-section" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', marginBottom: '24px', animationDelay: '0.1s' }}>
        {/* Amount over time */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' }}>Transaction Amount Flow</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>Last 20 transactions · Fraud amounts highlighted</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-2)' }}><span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#6366f1', display: 'block' }} />Legit</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-2)' }}><span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f43f5e', display: 'block' }} />Fraud</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={amountData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradLegit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradFraud" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="i" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v) => [`$${v.toFixed(2)}`]} />
              <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} fill="url(#gradLegit)" />
              <Area type="monotone" dataKey="fraud" stroke="#f43f5e" strokeWidth={2} fill="url(#gradFraud)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '4px' }}>Distribution</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '8px' }}>Legit vs Fraudulent split</p>
          <div style={{ flex: 1 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={4} dataKey="value" strokeWidth={0}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS_PIE[i]} />)}
                </Pie>
                <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-2)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS_PIE[i], display: 'block' }} />
                  {d.name}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-1)' }}>{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Bar chart + Model Metrics + Recent Fraud */}
      <div className="dash-section" style={{ display: 'grid', gridTemplateColumns: '1fr 320px 280px', gap: '16px', animationDelay: '0.15s' }}>
        {/* Daily bar */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px', backdropFilter: 'blur(12px)' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' }}>Daily Transaction Breakdown</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>Legitimate vs Fraud per day</p>
          </div>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                <Bar dataKey="legit" name="Legitimate" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fraud" name="Fraud" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
              No daily data yet — simulate some transactions
            </div>
          )}
        </div>

        {/* Model Metrics */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={14} color="#a855f7" />
            </div>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' }}>Model Performance</h2>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '18px' }}>Random Forest · Production model</p>
          {rf ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <MetricBar label="Accuracy" value={rf.accuracy} color="#6366f1" description="Overall correct predictions" />
              <MetricBar label="Precision" value={rf.precision} color="#10b981" description="True fraud / all flagged" />
              <MetricBar label="Recall" value={rf.recall} color="#a855f7" description="Fraud caught / all fraud" />
              <MetricBar label="F1 Score" value={rf.f1_score} color="#f59e0b" description="Precision–Recall balance" />
              <MetricBar label="ROC-AUC" value={rf.roc_auc} color="#06b6d4" description="Discrimination ability" />
            </div>
          ) : (
            <div style={{ color: 'var(--text-3)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No metrics available</div>
          )}
        </div>

        {/* Recent Fraud Alerts */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '16px', padding: '22px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={14} color="#f43f5e" />
            </div>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-1)' }}>Fraud Alerts</h2>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '16px' }}>Most recent flagged transactions</p>
          {recentFraud.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: '13px' }}>
              <ShieldCheck size={28} color="#10b981" style={{ margin: '0 auto 8px' }} />
              <p>No fraud detected</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentFraud.map((t) => (
                <div key={t.id} style={{
                  padding: '10px 12px', borderRadius: '10px',
                  background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.12)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>#{t.id}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#f43f5e', background: 'rgba(244,63,94,0.15)', padding: '2px 7px', borderRadius: '99px' }}>
                      {(t.fraud_probability * 100).toFixed(0)}% risk
                    </span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-1)', marginTop: '2px' }}>${t.amount?.toFixed(2)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{new Date(t.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {/* Quick stats */}
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Fraud Amount</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#f43f5e' }}>
              ${transactions.filter(t => t.is_fraud).length > 0
                ? (transactions.filter(t => t.is_fraud).reduce((s, t) => s + t.amount, 0) / transactions.filter(t => t.is_fraud).length).toFixed(2)
                : '0.00'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
