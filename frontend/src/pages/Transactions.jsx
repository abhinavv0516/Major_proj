import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListOrdered, RefreshCw, Download, FlaskConical, Search, X, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { getTransactions, clearTransactions, errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import useLiveFeed from '../hooks/useLiveFeed';
import SimulateModal from '../components/SimulateModal';
import TransactionDrawer from '../components/TransactionDrawer';
import { PageHeader, Card, RiskBadge, VerdictBadge, ReviewBadge, ProbBar, ErrorBanner, Empty, Loading } from '../components/ui';
import { money, dateTime, num } from '../utils/format';

const FILTERS = [
  ['all', 'All'],
  ['flagged', 'Flagged'],
  ['pending', 'Needs review'],
  ['reviewed', 'Reviewed'],
  ['legit', 'Legit'],
];

const COLUMNS = [
  ['id', 'ID'], ['amount', 'Amount'], ['fraud_probability', 'Fraud probability'], ['risk_level', 'Risk'],
  ['is_fraud', 'Verdict'], ['review_status', 'Review'], ['source', 'Source'], ['submitted_at', 'Received'],
];

const RISK_ORDER = { low: 0, medium: 1, high: 2 };
const sortValue = (t, col) => {
  const v = t[col];
  if (col === 'submitted_at') return v ? new Date(v).getTime() : 0;
  if (col === 'risk_level') return RISK_ORDER[v] ?? -1;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v ?? '';
};

const Transactions = () => {
  const { addToast } = useToast();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') || 'all';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ col: 'id', dir: 'desc' });
  const [simOpen, setSimOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [fresh, setFresh] = useState(new Set());

  const load = useCallback(() => getTransactions(0, 1000)
    .then(({ data }) => { setRows(data); setError(''); })
    .catch((err) => setError(errorMessage(err, 'Could not load transactions')))
    .finally(() => { setLoading(false); setRefreshing(false); }), []);

  useEffect(() => { load(); }, [load]);

  // New transactions stream in at the top of the table.
  const onLive = useCallback((tx) => {
    setRows((prev) => [tx, ...prev.filter((r) => r.id !== tx.id)]);
    setFresh((prev) => new Set(prev).add(tx.id));
  }, []);
  useLiveFeed({ max: 1, onEvent: onLive });

  const setFilter = (f) => setParams(f === 'all' ? {} : { filter: f });

  const visible = useMemo(() => {
    let out = rows;
    if (filter === 'flagged') out = out.filter((t) => t.is_fraud);
    if (filter === 'pending') out = out.filter((t) => t.is_fraud && !t.review_status);
    if (filter === 'reviewed') out = out.filter((t) => t.review_status);
    if (filter === 'legit') out = out.filter((t) => t.is_fraud === false);
    const q = search.trim();
    if (q) out = out.filter((t) => String(t.id).includes(q) || t.amount.toFixed(2).includes(q) || t.source.includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = sortValue(a, sort.col), bv = sortValue(b, sort.col);
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }, [rows, filter, search, sort]);

  const toggleSort = (col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  const exportCSV = () => {
    const header = ['id', 'submitted_at', 'amount', 'fraud_probability', 'risk_level', 'is_fraud', 'review_status', 'source', 'ground_truth', 'model_version'];
    const lines = visible.map((t) => header.map((h) => t[h] ?? '').join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fraudx_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    addToast(`Exported ${visible.length} transactions`, 'info', 3000);
  };

  const clearAll = async () => {
    if (!window.confirm('Delete ALL stored transactions, scores and reviews? This cannot be undone.')) return;
    try {
      await clearTransactions();
      setRows([]);
      addToast('All transactions deleted', 'info', 3000);
    } catch (err) {
      addToast(errorMessage(err, 'Could not delete transactions'), 'error', 5000);
    }
  };

  const onReviewed = (updated) => setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));

  const flagged = rows.filter((t) => t.is_fraud);
  const pending = flagged.filter((t) => !t.review_status).length;

  return (
    <div className="page">
      <PageHeader icon={ListOrdered} title="Transactions"
        subtitle={`${num(rows.length)} stored · ${num(flagged.length)} flagged · ${num(pending)} awaiting review`}>
        <button className="btn" onClick={() => { setRefreshing(true); load(); }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin .8s linear infinite' : 'none' }} /> Refresh
        </button>
        <button className="btn" onClick={exportCSV} disabled={!visible.length}><Download size={14} /> Export CSV</button>
        <button className="btn btn-danger" onClick={clearAll} disabled={!rows.length}><Trash2 size={14} /> Clear</button>
        <button className="btn btn-primary" onClick={() => setSimOpen(true)}><FlaskConical size={15} /> Simulate</button>
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '260px', maxWidth: '100%' }}>
            <Search size={14} color="var(--text-3)" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
            <input className="input" style={{ paddingLeft: '32px' }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, amount or source…" />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={13} /></button>
            )}
          </div>
          <div className="seg">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                {label}{key === 'pending' && pending > 0 ? ` (${pending})` : ''}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-3)' }}>Showing {num(visible.length)} of {num(rows.length)}</span>
        </div>

        {loading ? <Loading label="Loading transactions…" /> : visible.length === 0 ? (
          <Empty icon={Search} title={rows.length ? 'No transactions match' : 'No transactions yet'}>
            {rows.length ? 'Try another filter.' : 'Use Simulate to replay real held-out transactions.'}
          </Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  {COLUMNS.map(([col, label]) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {label}
                        {sort.col === col && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 500).map((t) => (
                  <tr key={t.id} className={`clickable${fresh.has(t.id) ? ' flash' : ''}`} onClick={() => setOpenId(t.id)}>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--text-1)' }}>#{t.id}</td>
                    <td style={{ fontWeight: 700, color: t.is_fraud ? 'var(--rose)' : 'var(--text-1)' }}>{money(t.amount)}</td>
                    <td><ProbBar value={t.fraud_probability} level={t.risk_level} /></td>
                    <td><RiskBadge level={t.risk_level} /></td>
                    <td><VerdictBadge fraud={t.is_fraud} /></td>
                    <td><ReviewBadge status={t.review_status} /></td>
                    <td style={{ fontSize: '12px' }}>{t.source}</td>
                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{dateTime(t.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length > 500 && <p className="muted" style={{ fontSize: '12px', padding: '10px 16px' }}>Showing the first 500 rows. Narrow with filters or export the CSV.</p>}
          </div>
        )}
      </Card>

      <SimulateModal open={simOpen} onClose={() => setSimOpen(false)} onDone={load} />
      <TransactionDrawer key={openId ?? 'none'} id={openId} onClose={() => setOpenId(null)} onReviewed={onReviewed} />
    </div>
  );
};

export default Transactions;
