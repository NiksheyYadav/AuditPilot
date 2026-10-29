import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './lib/api.js';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Report from './pages/Report.jsx';
import Compare from './pages/Compare.jsx';
import History from './pages/History.jsx';
import Site from './pages/Site.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  useEffect(() => {
    if (getToken()) api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
    const out = () => setUser(null);
    window.addEventListener('ap-logout', out);
    return () => window.removeEventListener('ap-logout', out);
  }, []);
  const value = {
    user, ready,
    signIn: (r) => { setToken(r.token); setUser(r.user); },
    signOut: () => { setToken(null); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function LlmBadge() {
  const [h, setH] = useState(null);
  useEffect(() => { const load = () => api.health().then(setH).catch(() => setH(null)); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  if (!h) return <span className="badge off" title="API unreachable">API offline</span>;
  const l = h.llm;
  if (l.mock) return <span className="badge mock" title="Scripted responses, not a real model">MOCK LLM</span>;
  if (l.reachable === false || l.modelInstalled === false) return <span className="badge off" title={l.error || 'Ollama not reachable'}>Local LLM offline - audits still work</span>;
  return <span className="badge live" title="Open-source model running locally via Ollama"><i className="dot" />Local LLM: {l.model} (Ollama)</span>;
}

function Shell() {
  const { user, ready, signOut } = useAuth();
  const nav = useNavigate();
  if (!ready) return <Spinner label="Loading..." />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden><rect width="32" height="32" rx="8" fill="url(#bg)" /><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#ec4899" /></linearGradient></defs><path d="M16 6l7 18-7-4-7 4z" fill="#fff" /></svg>AuditPilot</Link>
        <nav><NavLink to="/" end>Dashboard</NavLink><NavLink to="/history">History</NavLink><NavLink to="/compare">Compare</NavLink></nav>
        <div className="spacer" />
        <LlmBadge />
        <span className="user">{user.name}</span>
        <button className="btn ghost small" onClick={() => { signOut(); nav('/login'); }}>Log out</button>
      </header>
      <main className="page"><Outlet /></main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="audits/:id" element={<Report />} />
            <Route path="history" element={<History />} />
            <Route path="sites/:id" element={<Site />} />
            <Route path="compare" element={<Compare />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
