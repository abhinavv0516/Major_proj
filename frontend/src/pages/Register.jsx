import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/api';
import { ShieldCheck, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, Wifi, WifiOff } from 'lucide-react';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const navigate = useNavigate();

  const passwordStrength = (pwd) => {
    if (!pwd) return { label: '', color: '', width: '0%' };
    if (pwd.length < 6) return { label: 'Too short', color: '#ef4444', width: '20%' };
    if (pwd.length < 8) return { label: 'Weak', color: '#f97316', width: '40%' };
    if (!/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) return { label: 'Fair', color: '#eab308', width: '65%' };
    return { label: 'Strong', color: '#22c55e', width: '100%' };
  };

  const strength = passwordStrength(password);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, full_name: fullName, role: 'analyst' });
      setSuccess('Account created! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      if (!err.response) {
        // Network error but mock handled it — shouldn't reach here
        setError('Unable to connect. Please check if the server is running.');
        setIsDemoMode(true);
      } else {
        setError(err.response?.data?.detail || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

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
        position: 'absolute', top: '-10%', left: '-10%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        animation: 'float 8s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-10%',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
        animation: 'float 10s ease-in-out infinite reverse',
      }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
        @keyframes slideUp { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
        .register-card { animation: slideUp 0.5s ease forwards; font-family: 'Inter', sans-serif; }
        .input-field {
          width: 100%; padding: 12px 12px 12px 44px; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: white;
          font-size: 14px; outline: none; transition: all 0.2s; box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }
        .input-field::placeholder { color: rgba(148,163,184,0.7); }
        .input-field:focus { border-color: rgba(99,102,241,0.6); background: rgba(255,255,255,0.08); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .register-btn {
          width: 100%; padding: 14px; border: none; border-radius: 12px; cursor: pointer;
          font-size: 15px; font-weight: 600; transition: all 0.2s; font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white; box-shadow: 0 4px 20px rgba(99,102,241,0.4);
        }
        .register-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 25px rgba(99,102,241,0.5); }
        .register-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .error-shake { animation: shake 0.4s ease; }
      `}</style>

      <div className="register-card" style={{
        width: '100%', maxWidth: '440px',
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
        {/* Demo mode badge */}
        {isDemoMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: '99px', padding: '4px 10px', fontSize: '12px', color: '#fbbf24',
          }}>
            <WifiOff size={12} /> Demo Mode
          </div>
        )}
        {!isDemoMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '99px', padding: '4px 10px', fontSize: '12px', color: '#34d399',
          }}>
            <Wifi size={12} /> Live Mode
          </div>
        )}

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
          <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: '700', color: '#f1f5f9' }}>
            Create Account
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
            Join FraudX to start monitoring transactions
          </p>
        </div>

        {/* Error */}
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

        {/* Success */}
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
          }}>
            <CheckCircle2 size={16} color="#34d399" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#6ee7b7' }}>{success}</span>
          </div>
        )}

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Full Name */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input-field"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
                autoComplete="name"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input-field"
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
                className="input-field"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                style={{ paddingRight: '44px' }}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px',
              }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Strength bar */}
            {password && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: strength.width, background: strength.color, borderRadius: '99px', transition: 'all 0.3s' }} />
                </div>
                <span style={{ fontSize: '11px', color: strength.color, marginTop: '4px', display: 'block' }}>{strength.label}</span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#cbd5e1', marginBottom: '6px' }}>
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input-field"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  paddingRight: '44px',
                  borderColor: confirmPassword && password !== confirmPassword ? 'rgba(239,68,68,0.5)' : undefined,
                }}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px',
              }}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>Passwords don't match</p>
            )}
          </div>

          <button
            type="submit"
            className="register-btn"
            disabled={loading || !!success}
            style={{ marginTop: '8px' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Creating Account...
              </span>
            ) : 'Create Account'}
          </button>
        </form>

        <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#818cf8', fontWeight: '500', textDecoration: 'none' }}>
            Sign in here
          </Link>
        </p>

        <div style={{
          marginTop: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', textAlign: 'center',
        }}>
          <p style={{ fontSize: '11px', color: '#475569', margin: 0, lineHeight: '1.6' }}>
            🔒 If the backend is offline, accounts are saved locally in Demo Mode and will work for this session.
          </p>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
};

export default Register;
