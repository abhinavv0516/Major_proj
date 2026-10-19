import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { login, errorMessage, DEMO_ACCOUNT } from '../services/api';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const expired = params.get('expired') === '1';

  const signIn = async (user, pass) => {
    setLoading(true);
    setError('');
    try {
      const res = await login(user, pass);
      localStorage.setItem('token', res.data.access_token);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    signIn(email, password);
  };

  // Real account seeded by the backend on startup (SEED_DEMO_USER=true).
  const handleDemoLogin = () => signIn(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated orbs */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-10%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)',
        animation: 'float 9s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-5%',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
        animation: 'float 7s ease-in-out infinite reverse',
      }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
        @keyframes slideUp { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
        .login-card { animation: slideUp 0.5s ease forwards; font-family: 'Inter', sans-serif; }
        .input-field-login {
          width: 100%; padding: 12px 12px 12px 44px; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: white;
          font-size: 14px; outline: none; transition: all 0.2s; box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }
        .input-field-login::placeholder { color: rgba(148,163,184,0.7); }
        .input-field-login:focus { border-color: rgba(99,102,241,0.6); background: rgba(255,255,255,0.08); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .login-btn {
          width: 100%; padding: 14px; border: none; border-radius: 12px; cursor: pointer;
          font-size: 15px; font-weight: 600; transition: all 0.2s; font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white; box-shadow: 0 4px 20px rgba(99,102,241,0.4);
        }
        .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 25px rgba(99,102,241,0.5); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .demo-btn {
          width: 100%; padding: 12px; border-radius: 12px; cursor: pointer;
          font-size: 14px; font-weight: 500; transition: all 0.2s; font-family: 'Inter', sans-serif;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8;
        }
        .demo-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); color: #cbd5e1; }
        .error-shake { animation: shake 0.4s ease; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="login-card" style={{
        width: '100%', maxWidth: '420px',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        padding: '40px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px', borderRadius: '18px', marginBottom: '16px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(79,70,229,0.2))',
            border: '1px solid rgba(99,102,241,0.3)',
          }}>
            <ShieldCheck size={32} color="#818cf8" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', background: 'linear-gradient(135deg, #818cf8, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              FraudX
            </h1>
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '600', color: '#f1f5f9' }}>
            Welcome Back
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            Sign in to access the detection dashboard
          </p>
        </div>

        {/* Error */}
        {expired && !error && (
          <div style={{
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '12px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px', color: '#c7d2fe',
          }}>
            Your session expired. Please sign in again.
          </div>
        )}
        {error && (
          <div className="error-shake" key={error} style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
          }}>
            <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ fontSize: '13px', color: '#fca5a5', lineHeight: '1.5' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input-field-login"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@example.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input-field-login"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ paddingRight: '44px' }}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px',
              }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={loading} style={{ marginTop: '4px' }}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Authenticating...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: '12px', color: '#475569' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <button className="demo-btn" onClick={handleDemoLogin} disabled={loading}>
          🚀 Continue with Demo Account
        </button>
        <p style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
          {DEMO_ACCOUNT.email} · {DEMO_ACCOUNT.password}
        </p>

        <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#818cf8', fontWeight: '500', textDecoration: 'none' }}>
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
