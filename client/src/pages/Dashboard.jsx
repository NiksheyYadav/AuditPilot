import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { fmtDate, host, scoreColor } from '../lib/util.js';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';

function Trend({ audits }) {
  const urls = useMemo(() => [...new Set(audits.map((a) => a.url))], [audits]);
  const [url, setUrl] = useState('');
  const [pts, setPts] = useState([]);
  useEffect(() => { if (!url && urls.length) setUrl(urls[0]); }, [urls, url]);
  useEffect(() => { if (url) api.trend(url).then((r) => setPts(r.points.map((p) => ({ ...p, t: fmtDate(p.createdAt) })))).catch(() => setPts([])); }, [url, audits]);
  if (!urls.length) return null;
  return (
    <section className="card">
      <div className="row between wrap"><h2>Score trend</h2>
        <select value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL for trend chart">{urls.map((u) => <option key={u} value={u}>{host(u)}</option>)}</select></div>
      {pts.length < 2 && <p className="muted small">Run this URL again to see a trend line. Each audit is one point.</p>}
      <div className="chart">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={pts} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="overall" name="Overall" stroke="#6d28d9" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="seo" name="SEO" stroke="#0284c7" dot={false} />
            <Line type="monotone" dataKey="accessibility" name="Accessibility" stroke="#059669" dot={false} />
            <Line type="monotone" dataKey="security" name="Security" stroke="#e11d48" dot={false} />
            <Line type="monotone" dataKey="performance" name="Performance" stroke="#d97706" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [audits, setAudits] = useState(null);
  const [health, setHealth] = useState(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => api.listAudits().then((r) => setAudits(r.audits)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); api.health().then(setHealth).catch(() => {}); }, [load]);

  async function run(target, tag = 'custom') {
    setErr(''); setBusy(tag);
    try { const a = await api.createAudit(target); nav(`/audits/${a.id}`); }
    catch (e) { setErr(e.message); setBusy(''); }
  }
  const demo = (p) => `${health?.demoBase || 'http://localhost:4000'}${p}`;

  return (
    <div className="stack">
      <section className="card hero-card">
        <h1>Audit a website</h1>
        <p className="muted">Enter a URL. You get scores and evidence instantly; the AI summary follows in the background.</p>
        <form className="url-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) run(url.trim()); }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" aria-label="Website URL" disabled={!!busy} />
          <button className="btn primary" disabled={!!busy || !url.trim()}>{busy === 'custom' ? 'Auditing...' : 'Run audit'}</button>
        </form>
        <div className="row gap wrap">
          <span className="muted small">Built-in demo pages:</span>
          <button className="btn bad-btn" disabled={!!busy || health?.allowPrivateTargets === false} onClick={() => run(demo('/demo/bad'), 'bad')}>{busy === 'bad' ? 'Auditing...' : 'Audit demo (bad)'}</button>
          <button className="btn good-btn" disabled={!!busy || health?.allowPrivateTargets === false} onClick={() => run(demo('/demo/good'), 'good')}>{busy === 'good' ? 'Auditing...' : 'Audit demo (good)'}</button>
          {health?.allowPrivateTargets === false && <span className="muted small">(set ALLOW_PRIVATE_TARGETS=true in server/.env to enable)</span>}
        </div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </section>

      {audits === null && !err && <Spinner label="Loading audits..." />}
      {audits && audits.length === 0 && <Empty title="No audits yet">Try the demo buttons above to see a before and after score jump.</Empty>}
      {audits && audits.length > 0 && (
        <>
          <Trend audits={audits} />
          <section className="card">
            <div className="row between"><h2>Recent audits</h2><Link className="btn ghost small" to="/compare">Compare two</Link></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>URL</th><th>Score</th><th>Issues</th><th>AI</th><th>When</th></tr></thead>
                <tbody>
                  {audits.map((a) => (
                    <tr key={a.id}>
                      <td><Link to={`/audits/${a.id}`} className="url-link">{host(a.url)}</Link></td>
                      <td><span className="score-pill" style={{ background: scoreColor(a.scores.overall) }}>{a.scores.overall}</span></td>
                      <td>{a.issues}</td>
                      <td><span className={`ai-st ${a.aiStatus}`}>{a.seeded ? 'sample' : a.aiStatus}</span></td>
                      <td className="muted">{fmtDate(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
