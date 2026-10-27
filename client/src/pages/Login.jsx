import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../App.jsx';
import { ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = mode === 'login' ? await api.login({ email: f.email, password: f.password }) : await api.register(f);
      signIn(r); nav('/');
    } catch (e2) {
      const d = e2.details ? Object.values(e2.details).flat().join(' ') : '';
      setErr(`${e2.message}${d ? `: ${d}` : ''}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <div className="logo-lg"><svg viewBox="0 0 32 32" width="44" height="44" aria-hidden><rect width="32" height="32" rx="9" fill="#fff" fillOpacity=".18" /><path d="M16 6l7 18-7-4-7 4z" fill="#fff" /></svg></div>
        <h1>AuditPilot</h1>
        <p className="lead">Audit any website for SEO, accessibility, security and performance. Tools compute the facts. A local open-source AI agent explains them.</p>
        <ul className="ticks"><li>Deterministic scores in seconds</li><li>Private AI: runs on your machine via Ollama</li><li>Ask follow-up questions, compare before and after</li></ul>
      </section>
      <form className="auth-card card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'register' && <label>Name<input value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></label>}
        <label>Email<input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {err && <ErrorBox>{err}</ErrorBox>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
        <p className="muted small center">{mode === 'login' ? 'New here?' : 'Already registered?'}{' '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? 'Create an account' : 'Log in'}</button></p>
        {mode === 'login' && <button type="button" className="btn ghost block" onClick={() => setF({ ...f, email: 'demo@auditpilot.dev', password: 'demo1234' })}>Fill demo login</button>}
      </form>
    </div>
  );
}
