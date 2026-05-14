import { useEffect, useState, useMemo } from 'react';
import { getTransactions, createTransaction } from '../services/api';
import { useToast } from '../context/ToastContext';
import {
  Search, Plus, ShieldAlert, ShieldCheck, ChevronUp, ChevronDown,
  RefreshCw, Download, TrendingUp, DollarSign, Activity, X
} from 'lucide-react';

const Badge = ({ fraud }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: '700',
    background: fraud ? 'rgba(244,63,94,0.12)' : 'rgba(16,185,129,0.10)',
    color: fraud ? '#fb7185' : '#34d399',
    border: `1px solid ${fraud ? 'rgba(244,63,94,0.25)' : 'rgba(16,185,129,0.2)'}`,
  }}>
    {fraud ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
    {fraud ? 'Fraud' : 'Legit'}
  </span>
);

const RiskBar = ({ prob, isFraud }) => {
  const pct = Math.max((prob ?? 0) * 100, 3);
  const color = pct > 60 ? '#f43f5e' : pct > 30 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '99px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '99px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: '600', color }}>{pct.toFixed(1)}%</span>
    </div>
  );
};

const SummaryCard = ({ icon: Icon, label, value, color }) => (
  <div style={{
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
    padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px',
    backdropFilter: 'blur(12px)',
  }}>
    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${color}18`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={18} color={color} />
    </div>
    <div>
      <p style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
      <p style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-1)', marginTop: '2px' }}>{value}</p>
    </div>
  </div>
);

const Transactions = () => {
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | fraud | legit
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransactions = async () => {
    try {
      const res = await getTransactions();
      setTransactions(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTransactions(); }, []);

  const simulateTransaction = async () => {
    setSimulating(true);
    try {
      const isFraud = Math.random() > 0.75;
      const amount = parseFloat((Math.random() * 990 + 10).toFixed(2));
      const tx = {
        time: Math.random() * 100000,
        amount,
        ...Array.from({ length: 28 }).reduce((a, _, i) => ({
          ...a, [`v${i + 1}`]: isFraud ? (Math.random() * 5 - 2.5) : (Math.random() * 2 - 1),
        }), {}),
      };
      const res = await createTransaction(tx);
      await fetchTransactions();
      const prob = res?.data?.fraud_probability ?? (isFraud ? 0.82 : 0.12);
      if (isFraud) {
        addToast(`🚨 Fraud Detected! $${amount.toFixed(2)} · Risk: ${(prob*100).toFixed(1)}%`, 'fraud', 7000);
      } else {
        addToast(`✅ Legitimate transaction simulated · $${amount.toFixed(2)}`, 'success', 4000);
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to simulate transaction.', 'error', 3000);
    }
    finally { setSimulating(false); }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Amount', 'Time', 'Fraud Probability', 'Status', 'Date'];
    const rows = filtered.map(t => [
      t.id, t.amount?.toFixed(2), t.time?.toFixed(2),
      (t.fraud_probability * 100).toFixed(2) + '%',
      t.is_fraud ? 'Fraud' : 'Legitimate',
      new Date(t.created_at).toLocaleString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fraudx_transactions_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported ${filtered.length} transactions as CSV.`, 'info', 3000);
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let rows = [...transactions];
    if (searchTerm) rows = rows.filter(t =>
      String(t.id).includes(searchTerm) ||
      String(t.amount).includes(searchTerm)
    );
    if (filterStatus === 'fraud') rows = rows.filter(t => t.is_fraud);
    if (filterStatus === 'legit') rows = rows.filter(t => !t.is_fraud);
    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'string') av = new Date(av).getTime();
      if (typeof bv === 'string') bv = new Date(bv).getTime();
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [transactions, searchTerm, filterStatus, sortCol, sortDir]);

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);
  const fraudCount = transactions.filter(t => t.is_fraud).length;
  const avgAmount = transactions.length ? totalAmount / transactions.length : 0;

  const SortIcon = ({ col }) => sortCol === col
    ? (sortDir === 'asc' ? <ChevronUp size={13} color="#818cf8" /> : <ChevronDown size={13} color="#818cf8" />)
    : <ChevronDown size={13} color="#334155" />;

  const colStyle = (col) => ({
    padding: '12px 16px', fontSize: '11px', fontWeight: '700', color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer',
    userSelect: 'none', whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center', gap: '4px',
    background: sortCol === col ? 'rgba(99,102,241,0.05)' : 'transparent',
  });

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%', background: 'var(--bg-base)' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .tx-row { transition: background 0.12s; }
        .tx-row:hover { background: rgba(99,102,241,0.04) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', animation: 'fadeUp 0.3s ease both' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-1)', letterSpacing: '-0.5px' }}>Transactions</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '4px' }}>
            {transactions.length} total · {fraudCount} fraud · {transactions.length - fraudCount} legitimate
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setRefreshing(true); fetchTransactions(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
              color: 'var(--text-2)', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
              color: 'var(--text-2)', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
            }}
          >
            <Download size={13} /> Export CSV
          </button>
          <button
            onClick={simulateTransaction}
            disabled={simulating}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px',
              background: simulating ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
              border: 'none', borderRadius: '10px', color: 'white', fontSize: '13px', fontWeight: '600',
              cursor: simulating ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,0.35)', transition: 'all 0.15s',
            }}
          >
            {simulating
              ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />Simulating…</>
              : <><Plus size={15} />Simulate Transaction</>}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px', animation: 'fadeUp 0.35s ease both', animationDelay: '0.05s' }}>
        <SummaryCard icon={Activity} label="Total" value={transactions.length.toLocaleString()} color="#6366f1" />
        <SummaryCard icon={ShieldAlert} label="Fraud" value={fraudCount.toLocaleString()} color="#f43f5e" />
        <SummaryCard icon={DollarSign} label="Total Volume" value={`$${totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="#10b981" />
        <SummaryCard icon={TrendingUp} label="Avg Amount" value={`$${avgAmount.toFixed(2)}`} color="#f59e0b" />
      </div>

      {/* Table card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', backdropFilter: 'blur(12px)', overflow: 'hidden', animation: 'fadeUp 0.4s ease both', animationDelay: '0.1s' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '320px' }}>
            <Search size={14} color="#475569" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by ID or amount…"
              style={{
                width: '100%', padding: '8px 12px 8px 34px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-2)',
                borderRadius: '9px', color: 'var(--text-1)', fontSize: '13px', outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px' }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['all', 'All'], ['legit', '✓ Legit'], ['fraud', '⚠ Fraud']].map(([val, lbl]) => (
              <button key={val} onClick={() => setFilterStatus(val)} style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                background: filterStatus === val
                  ? val === 'fraud' ? 'rgba(244,63,94,0.15)' : val === 'legit' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.15)'
                  : 'rgba(255,255,255,0.03)',
                color: filterStatus === val
                  ? val === 'fraud' ? '#fb7185' : val === 'legit' ? '#34d399' : '#818cf8'
                  : 'var(--text-3)',
                border: `1px solid ${filterStatus === val
                  ? val === 'fraud' ? 'rgba(244,63,94,0.3)' : val === 'legit' ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.3)'
                  : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>
                {lbl}
              </button>
            ))}
          </div>

          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-3)' }}>
            Showing {filtered.length} of {transactions.length}
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  ['id', 'Tx ID'],
                  ['amount', 'Amount'],
                  ['fraud_probability', 'Risk Score'],
                  ['is_fraud', 'Status'],
                  ['created_at', 'Date & Time'],
                ].map(([col, label]) => (
                  <th key={col} onClick={() => handleSort(col)} style={{ background: 'rgba(255,255,255,0.01)', padding: 0 }}>
                    <div style={colStyle(col)}>
                      {label} <SortIcon col={col} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
                    <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '2px solid rgba(99,102,241,0.2)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '8px' }} />
                    <br />Loading transactions…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)', fontSize: '14px' }}>
                    <Search size={28} style={{ margin: '0 auto 8px', display: 'block', color: '#334155' }} />
                    No transactions found
                  </td>
                </tr>
              ) : filtered.map((tx, idx) => (
                <tr key={tx.id} className="tx-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-1)', fontFamily: 'monospace' }}>#{tx.id}</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: tx.is_fraud ? '#fb7185' : 'var(--text-1)' }}>
                      ${tx.amount?.toFixed(2)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <RiskBar prob={tx.fraud_probability} isFraud={tx.is_fraud} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <Badge fraud={tx.is_fraud} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>{new Date(tx.created_at).toLocaleString()}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
              {filtered.filter(t => t.is_fraud).length} fraud · ${filtered.filter(t => t.is_fraud).reduce((s, t) => s + t.amount, 0).toFixed(2)} at risk
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
              Total volume: ${filtered.reduce((s, t) => s + t.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;
