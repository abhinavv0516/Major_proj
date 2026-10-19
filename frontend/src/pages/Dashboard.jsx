import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ShieldAlert, DollarSign, ClipboardCheck, Gauge, RefreshCw, FlaskConical, Radio,
  LayoutDashboard, Inbox, Target,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getAnalytics, getTimeseries, getTransactions, errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import useLiveFeed from '../hooks/useLiveFeed';
import SimulateModal from '../components/SimulateModal';
import TransactionDrawer from '../components/TransactionDrawer';
import { PageHeader, Card, Stat, RiskBadge, ProbBar, ErrorBanner, Empty, Loading } from '../components/ui';
import { COLORS, RISK, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, num, money, pct, timeAgo } from '../utils/format';

const BUCKETS = { minute: { points: 30, fmt: { hour: '2-digit', minute: '2-digit' } }, hour: { points: 24, fmt: { hour: '2-digit' } }, day: { points: 14, fmt: { month: 'short', day: 'numeric' } } };

const LiveDot = ({ on }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 11px', borderRadius: '99px', fontSize: '12px', fontWeight: 600, background: on ? 'var(--emerald-t)' : 'var(--bg-input)', color: on ? COLORS.emerald : 'var(--text-3)', border: `1px solid ${on ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: on ? COLORS.emerald : COLORS.slate, animation: on ? 'pulseDot 2s infinite' : 'none' }} />
    {on ? 'Live' : 'Offline'}
  </span>
);

const Dashboard = () => {
  const { addToast } = useToast();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [queue, setQueue] = useState([]);
  const [bucket, setBucket] = useState('minute');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const refreshTimer = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [a, t, q] = await Promise.all([
        getAnalytics(),
        getTimeseries(bucket, BUCKETS[bucket].points),
        getTransactions(0, 200),
      ]);
      setSummary(a.data);
      setSeries(t.data);
      setQueue(q.data.filter((x) => x.is_fraud && !x.review_status).slice(0, 6));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load dashboard data'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bucket]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Live feed: refresh aggregates at most every 1.5s while events stream in.
  const onEvent = useCallback((tx) => {
    if (tx.is_fraud && tx.risk_level === 'high' && tx.source !== 'simulation') {
      addToast(`High-risk transaction #${tx.id} · ${money(tx.amount)} · ${pct(tx.fraud_probability)}`, 'fraud', 6000);
    }
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(fetchAll, 1500);
  }, [addToast, fetchAll]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  const { events, connected } = useLiveFeed({ max: 12, onEvent });

  const s = summary;
  const total = s?.total_transactions ?? 0;
  const riskData = s ? Object.entries(s.risk_counts).map(([k, v]) => ({ name: RISK[k].label, value: v, color: RISK[k].color })) : [];
  const perf = s?.live_performance;
  const chartData = series.map((p) => ({ ...p, label: new Date(p.bucket).toLocaleString([], BUCKETS[bucket].fmt) }));

  return (
    <div className="page">
      <PageHeader icon={LayoutDashboard} title="Operations Dashboard" subtitle="Live fraud scoring, alert queue and model performance on labelled traffic">
        <LiveDot on={connected} />
        <button className="btn" onClick={() => { setRefreshing(true); fetchAll(); }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin .8s linear infinite' : 'none' }} /> Refresh
        </button>
        <button className="btn btn-primary" onClick={() => setSimOpen(true)}><FlaskConical size={15} /> Simulate traffic</button>
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={fetchAll} />}
      {loading ? <Loading label="Loading dashboard…" /> : s && (
        <>
          <div className="grid-kpi fade-up" style={{ marginBottom: '18px' }}>
            <Stat icon={Activity} label="Transactions scored" value={num(total)} sub={s.errors ? `${s.errors} scoring errors` : 'each stored with its explanation'} color={COLORS.indigo} />
            <Stat icon={ShieldAlert} label="Flagged as fraud" value={num(s.fraud_transactions)} sub={`${s.fraud_percentage.toFixed(2)}% of traffic`} color={COLORS.rose} />
            <Stat icon={DollarSign} label="Amount at risk" value={money(s.amount_flagged)} sub={`of ${money(s.amount_total)} scored`} color={COLORS.amber} />
            <Stat icon={ClipboardCheck} label="Awaiting review" value={num(s.review.pending)} sub={`${s.review.reviewed} reviewed so far`} color={COLORS.purple} />
            <Stat icon={Gauge} label="Avg scoring time" value={s.avg_latency_ms != null ? `${s.avg_latency_ms.toFixed(1)} ms` : '—'} sub="model + SHAP per transaction" color={COLORS.cyan} />
          </div>

          {total === 0 && (
            <Card style={{ marginBottom: '18px' }}>
              <Empty icon={FlaskConical} title="No transactions yet">
                Click <b>Simulate traffic</b> to replay real held-out transactions through the model,
                or score one by hand on the Live Analyzer page.
              </Empty>
            </Card>
          )}

          <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Card title="Traffic" subtitle="Scored transactions per period"
              action={(
                <div className="seg">
                  {Object.keys(BUCKETS).map((b) => <button key={b} className={b === bucket ? 'active' : ''} onClick={() => setBucket(b)}>{b}</button>)}
                </div>
              )}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="legit" name="Legitimate" stackId="a" fill={COLORS.indigo} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="flagged" name="Flagged" stackId="a" fill={COLORS.rose} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Risk mix" subtitle="Share of scored traffic by risk band">
              {total ? (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                      {riskData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Empty title="Nothing scored yet" />}
            </Card>
          </div>

          <div className="stack-md fade-up" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '16px' }}>
            <Card title="Live feed" subtitle="Streamed from the API as transactions are scored"
              action={<Radio size={16} color={connected ? COLORS.emerald : COLORS.slate} />}>
              {events.length === 0 ? (
                <Empty title="Waiting for transactions…">New scores appear here instantly.</Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '330px', overflowY: 'auto' }}>
                  {events.map((t) => (
                    <button key={t.id} onClick={() => setOpenId(t.id)} className="fade-up" style={{
                      display: 'grid', gridTemplateColumns: '54px 1fr auto', alignItems: 'center', gap: '10px', textAlign: 'left',
                      padding: '9px 10px', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--border)',
                      background: t.is_fraud ? 'var(--rose-t)' : 'var(--bg-input)',
                    }}>
                      <span className="mono" style={{ fontSize: '12px', color: 'var(--text-3)' }}>#{t.id}</span>
                      <span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{money(t.amount)}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-3)', marginLeft: '8px' }}>{t.source} · {timeAgo(t.submitted_at)}</span>
                      </span>
                      <ProbBar value={t.fraud_probability} level={t.risk_level} width={50} />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Review queue" subtitle="Flagged transactions waiting for an analyst" accent={COLORS.rose}>
              {queue.length === 0 ? (
                <Empty icon={Inbox} title="Queue is clear" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {queue.map((t) => (
                    <button key={t.id} onClick={() => setOpenId(t.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', background: 'var(--bg-input)', border: '1px solid var(--border)', textAlign: 'left' }}>
                      <span>
                        <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{money(t.amount)}</span>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-3)' }}>#{t.id} · {pct(t.fraud_probability)}</span>
                      </span>
                      <RiskBadge level={t.risk_level} />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Detection on labelled traffic" subtitle="Model vs. truth (simulation labels + analyst reviews)"
              action={<Target size={16} color={COLORS.purple} />}>
              {perf && perf.labelled ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                    {[
                      ['Caught', perf.tp, COLORS.emerald], ['Missed', perf.fn, COLORS.rose],
                      ['False alarms', perf.fp, COLORS.amber], ['Correct passes', perf.tn, COLORS.slate],
                    ].map(([k, v, c]) => (
                      <div key={k} style={{ padding: '10px', borderRadius: '10px', background: `${c}12`, border: `1px solid ${c}30` }}>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: c }}>{num(v)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600 }}>{k}</div>
                      </div>
                    ))}
                  </div>
                  {[['Recall (fraud caught)', perf.recall, COLORS.purple], ['Precision (alerts that were fraud)', perf.precision, COLORS.emerald], ['Accuracy', perf.accuracy, COLORS.indigo]].map(([k, v, c]) => (
                    <div key={k} style={{ marginBottom: '9px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-2)' }}>{k}</span><b style={{ color: c }}>{pct(v)}</b>
                      </div>
                      <div style={{ height: '5px', background: 'var(--bg-input)', borderRadius: '99px' }}>
                        <div style={{ height: '100%', width: `${(v || 0) * 100}%`, background: c, borderRadius: '99px', transition: 'width .6s' }} />
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>{num(perf.labelled)} labelled transactions</p>
                </>
              ) : (
                <Empty title="No labelled transactions yet">Simulated traffic carries true labels; analyst reviews add more.</Empty>
              )}
            </Card>
          </div>
        </>
      )}

      <SimulateModal open={simOpen} onClose={() => setSimOpen(false)} onDone={fetchAll} />
      <TransactionDrawer id={openId} onClose={() => setOpenId(null)} onReviewed={fetchAll} />
    </div>
  );
};

export default Dashboard;
