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

function Schedules() {
  const [list, setList] = useState(null);
  const [url, setUrl] = useState('');
  const [hours, setHours] = useState(24);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.listSchedules().then((r) => setList(r.schedules)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  async function add(e) {
    e.preventDefault(); setErr('');
    try { await api.createSchedule({ url: url.trim(), everyHours: Number(hours) }); setUrl(''); load(); } catch (x) { setErr(x.message); }
  }
  return (
    <section className="card">
      <h2>Scheduled audits</h2>
      <p className="muted small">Re-audit a URL automatically (first run within a minute). Each run is saved and feeds the trend chart.</p>
      <form className="sched-form" onSubmit={add}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://nikshey.xyz" aria-label="URL to schedule" />
        <select value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Interval">
          <option value={1}>every hour</option><option value={6}>every 6 hours</option><option value={24}>every day</option><option value={168}>every week</option>
        </select>
        <button className="btn primary" disabled={!url.trim()}>Schedule</button>
      </form>
      {err && <ErrorBox>{err}</ErrorBox>}
      {list && list.length === 0 && <p className="muted small">No schedules yet.</p>}
      {list && list.map((s) => (
        <div className="sched-row" key={s.id}>
          <div><b>{host(s.url)}</b> <span className="muted small">every {s.everyHours} h</span>
            <div className="muted small">{s.lastRunAt ? `last run ${fmtDate(s.lastRunAt)}` : 'not run yet'} &middot; next {fmtDate(s.nextRunAt)}{s.lastError && <span className="err"> &middot; {s.lastError}</span>}</div></div>
          <button className="btn ghost small danger" onClick={() => api.deleteSchedule(s.id).then(load)}>Remove</button>
        </div>
      ))}
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
  const [render, setRender] = useState(false);
  const [wholeSite, setWholeSite] = useState(false);
  const [pages, setPages] = useState(10);
  const [sites, setSites] = useState([]);

  const load = useCallback(() => api.listAudits().then((r) => setAudits(r.audits)).catch((e) => setErr(e.message)), []);
  useEffect(() => { api.listSites().then((r) => setSites(r.sites)).catch(() => {}); }, []);
  useEffect(() => { load(); api.health().then(setHealth).catch(() => {}); }, [load]);

  async function run(target, tag = 'custom') {
    setErr(''); setBusy(tag);
    try {
      if (wholeSite) { const s = await api.createSite(target, Number(pages), render); nav(`/sites/${s.id}`); return; }
      const a = await api.createAudit(target, render); nav(`/audits/${a.id}`);
    }
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
        <label className="check"><input type="checkbox" checked={render} disabled={!!busy || health?.renderAvailable === false} onChange={(e) => setRender(e.target.checked)} /> Render JavaScript (headless browser, for client-side apps){health?.renderAvailable === false && <span className="muted small"> - install Chrome or Edge to enable</span>}</label>
        <div className="row gap wrap">
          <label className="check"><input type="checkbox" checked={wholeSite} disabled={!!busy} onChange={(e) => setWholeSite(e.target.checked)} /> Audit the whole site (crawl)</label> {wholeSite && <select value={pages} onChange={(e) => setPages(e.target.value)} aria-label="Pages to audit"><option value={5}>up to 5 pages</option><option value={10}>up to 10 pages</option><option value={25}>up to 25 pages</option></select>} <span className="muted small">Quick audits:</span>
          <button className="btn live-btn" disabled={!!busy} onClick={() => run('https://nikshey.xyz', 'nik')}>{busy === 'nik' ? 'Auditing...' : 'Audit nikshey.xyz'}</button>
          <button className="btn bad-btn" disabled={!!busy || health?.allowPrivateTargets === false} onClick={() => run(demo('/demo/bad'), 'bad')}>{busy === 'bad' ? 'Auditing...' : 'Audit demo (bad)'}</button>
          <button className="btn good-btn" disabled={!!busy || health?.allowPrivateTargets === false} onClick={() => run(demo('/demo/good'), 'good')}>{busy === 'good' ? 'Auditing...' : 'Audit demo (good)'}</button>
          {health?.allowPrivateTargets === false && <span className="muted small">(set ALLOW_PRIVATE_TARGETS=true in server/.env to enable)</span>}
        </div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </section>

      {sites.length > 0 && (
        <section className="card">
          <h2>Recent site audits</h2>
          {sites.slice(0, 5).map((s) => (
            <div className="sched-row" key={s.id}>
              <div><Link className="url-link" to={`/sites/${s.id}`}>{host(s.url)}</Link> <span className="muted small">{s.pageCount} pages &middot; {s.status} &middot; {fmtDate(s.createdAt)}</span></div>
              {s.scores?.overall !== undefined && <span className="score-pill" style={{ background: scoreColor(s.scores.overall) }}>{s.scores.overall}</span>}
            </div>
          ))}
        </section>
      )}

      <Schedules />

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
