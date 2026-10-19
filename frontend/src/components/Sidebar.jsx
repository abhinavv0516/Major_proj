import { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListOrdered, LogOut, ShieldCheck, Bell, ChevronRight, Zap, Sun, Moon, BrainCircuit } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getMe, getAnalytics, getHealth } from '../services/api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ListOrdered, label: 'Transactions' },
  { to: '/predict', icon: Zap, label: 'Live Analyzer' },
  { to: '/model', icon: BrainCircuit, label: 'Model & Validation' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggle, isDark } = useTheme();
  const [me, setMe] = useState(null);
  const [pending, setPending] = useState(0);
  const [modelOk, setModelOk] = useState(null);

  useEffect(() => {
    getMe().then(({ data }) => setMe(data)).catch(() => {});
    const poll = () => {
      getAnalytics().then(({ data }) => setPending(data.review.pending)).catch(() => {});
      getHealth().then(({ data }) => setModelOk(data.model.loaded)).catch(() => setModelOk(false));
    };
    poll();
    const t = setInterval(poll, 20000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <aside className="sidebar-dark" style={{
      width: '240px', flexShrink: 0,
      background: 'var(--bg-1)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100vh',
      position: 'relative', zIndex: 20, transition: 'background 0.25s, border-color 0.25s',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
            background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(99,102,241,0.35)',
          }}>
            <ShieldCheck size={18} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--text-1)' }}>FraudX</div>
            <div style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '600', letterSpacing: '0.5px' }}>DETECTION SYSTEM</div>
          </div>
          {/* Dark/Light toggle */}
          <button
            onClick={toggle}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              marginLeft: 'auto', width: '30px', height: '30px', borderRadius: '8px',
              background: 'var(--bg-input)', border: '1px solid var(--border-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-2)', transition: 'all 0.2s', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--indigo-t)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-input)'}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        {/* System Active */}
        <div style={{
          marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px',
          background: modelOk === false ? 'rgba(244,63,94,0.10)' : 'rgba(16,185,129,0.07)',
          border: `1px solid ${modelOk === false ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.18)'}`,
          borderRadius: '8px', padding: '5px 10px',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: modelOk === false ? '#f43f5e' : '#10b981', display: 'block', animation: modelOk ? 'pulseDot 2s infinite' : 'none' }} />
          <span style={{ fontSize: '11px', color: modelOk === false ? '#fb7185' : '#34d399', fontWeight: '600' }}>
            {modelOk == null ? 'Connecting…' : modelOk ? 'Model online' : 'Model offline'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-3)' }}>v3.0</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <p style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '700', letterSpacing: '1px', padding: '0 8px', marginBottom: '4px', textTransform: 'uppercase' }}>Main Menu</p>

        {navItems.map(({ to, icon: Icon, label, badge }) => {
          const active = isActive(to);
          return (
            <NavLink key={to} to={to} end={to === '/'}
              style={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 11px', borderRadius: '10px', fontSize: '13px', fontWeight: '500',
                color: active ? 'var(--text-1)' : 'var(--text-2)',
                background: active ? 'var(--indigo-t)' : 'transparent',
                border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
                transition: 'all 0.15s', textDecoration: 'none',
              }}
            >
              <Icon size={16} style={{ color: active ? 'var(--indigo)' : 'var(--text-3)', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label}</span>
              {badge && (
                <span style={{ fontSize: '9px', fontWeight: '800', padding: '2px 6px', borderRadius: '6px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', color: 'white', letterSpacing: '0.5px' }}>{badge}</span>
              )}
              {active && !badge && <ChevronRight size={13} style={{ color: 'var(--indigo)', opacity: 0.6 }} />}
            </NavLink>
          );
        })}

        <div style={{ margin: '12px 0 6px', height: '1px', background: 'var(--border)' }} />
        <p style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: '700', letterSpacing: '1px', padding: '0 8px', marginBottom: '4px', textTransform: 'uppercase' }}>System</p>

        <Link to="/transactions?filter=pending" style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          padding: '9px 11px', borderRadius: '10px', fontSize: '13px', fontWeight: '500',
          color: 'var(--text-2)', textDecoration: 'none',
        }}>
          <Bell size={16} style={{ color: 'var(--text-3)' }} />
          <span style={{ flex: 1 }}>Review queue</span>
          {pending > 0 && <span style={{ fontSize: '10px', fontWeight: '700', background: '#f43f5e', color: 'white', borderRadius: '99px', padding: '1px 7px' }}>{pending}</span>}
        </Link>
      </nav>

      {/* User */}
      <div style={{ padding: '10px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 10px', borderRadius: '10px', marginBottom: '3px', background: 'var(--bg-input)' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: 'white' }}>{(me?.full_name || me?.email || 'A').charAt(0).toUpperCase()}</div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.full_name || 'Analyst'}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.email || 'Fraud Analyst'}</div>
          </div>
        </div>
        <button onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', borderRadius: '9px', fontSize: '12px', fontWeight: '500', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', width: '100%', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(244,63,94,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'none'; }}
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      <style>{`
        @keyframes pulseDot {
          0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
          50% { opacity:.8; box-shadow: 0 0 0 4px rgba(16,185,129,0); }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
