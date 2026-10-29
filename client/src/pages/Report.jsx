import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { CATS, SEV_ORDER, download, fmtDate, host, toMarkdown } from '../lib/util.js';
import { Empty, ErrorBox, Gauge, Md, MiniScore, Spinner } from '../components/ui.jsx';
import Finding from '../components/Finding.jsx';
import Chat from '../components/Chat.jsx';

export function AiCard({ audit, title = 'AI summary and fix plan' }) {
  const { aiStatus: st } = audit;
  return (
    <section className="card ai-card">
      <div className="row between wrap">
        <h2>{title}</h2>
        {audit.seeded && <span className="badge mock" title="Pre-written sample text generated from the real findings">Seeded sample text</span>}
        {audit.llm && !audit.seeded && st === 'ready' && <span className="muted small">{audit.llm.mock ? 'MOCK LLM (scripted)' : `Written by ${audit.llm.model}, locally`}</span>}
      </div>
      {st === 'pending' && (
        <div className="pending"><div className="shimmer w90" /><div className="shimmer w75" /><div className="shimmer w60" />
          <p className="muted small"><span className="dots"><i /><i /><i /></span> AI is writing the summary... The scores and findings below are already final.</p></div>
      )}
      {st === 'ready' && <><Md text={audit.summary} />{audit.fixPlan && <><h3>Prioritised fix plan</h3><Md text={audit.fixPlan} /></>}</>}
      {st === 'skipped' && <p className="muted">AI summary is not available (local LLM is off or skipped). The full deterministic report below is complete.</p>}
      {st === 'failed' && <div className="alert note">The AI summary failed{audit.aiError ? `: ${audit.aiError}` : ''}. The deterministic report below is unaffected.</div>}
    </section>
  );
}

export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const [audit, setAudit] = useState(null);
  const [all, setAll] = useState([]);
  const [err, setErr] = useState('');
  const [sev, setSev] = useState('all');
  const [cat, setCat] = useState('all');
  const [passes, setPasses] = useState(false);

  const load = useCallback(() => api.getAudit(id).then(setAudit).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { setAudit(null); load(); api.listAudits().then((r) => setAll(r.audits)).catch(() => {}); }, [load]);
  useEffect(() => {
    if (audit?.aiStatus !== 'pending') return undefined;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [audit?.aiStatus, load]);

  const findings = useMemo(() => (audit?.findings || [])
    .filter((f) => (passes || f.severity !== 'pass') && (sev === 'all' || f.severity === sev) && (cat === 'all' || f.category === cat))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]), [audit, sev, cat, passes]);

  if (err) return <div className="stack"><ErrorBox>{err}</ErrorBox><Link to="/" className="btn ghost">Back to dashboard</Link></div>;
  if (!audit) return <Spinner label="Loading report..." />;
  const counts = audit.findings.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] || 0) + 1 }), {});
  const others = all.filter((a) => a.id !== audit.id);

  async function remove() {
    if (!window.confirm('Delete this audit?')) return;
    await api.deleteAudit(audit.id); nav('/');
  }

  return (
    <div className="report">
      <div className="row between wrap gap noprint">
        <div><Link to="/" className="muted small">&larr; Dashboard</Link>
          <h1 className="url-title">{host(audit.url)}</h1>
          <p className="muted small">{audit.site && <Link className="badge live" to={`/sites/${audit.site}`}>Part of a site audit</Link>} {audit.rendered && <span className="badge live">JS rendered</span>} {audit.finalUrl} &middot; {fmtDate(audit.createdAt)} &middot; audited in {audit.durationMs} ms</p></div>
        <div className="row gap wrap">
          {others.length > 0 && <select aria-label="Compare with" value="" onChange={(e) => e.target.value && nav(`/compare?a=${e.target.value}&b=${audit.id}`)}><option value="">Compare with...</option>{others.map((o) => <option key={o.id} value={o.id}>{host(o.url)} - {o.scores.overall} - {fmtDate(o.createdAt)}</option>)}</select>}
          <button className="btn ghost" onClick={() => download(`auditpilot-${host(audit.url).replace(/[^a-z0-9]+/gi, '-')}.md`, toMarkdown(audit))}>Export Markdown</button>
          <button className="btn ghost" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn ghost danger" onClick={remove}>Delete</button>
        </div>
      </div>
      <h1 className="print-only">AuditPilot report: {audit.url}</h1>

      <section className="card scores">
        <Gauge value={audit.scores.overall} />
        <div className="mini-grid">{CATS.map((c) => <MiniScore key={c.key} label={c.label} value={audit.scores[c.key]} />)}</div>
        <div className="sev-sum"><span className="sev sev-high">{counts.high || 0} high</span><span className="sev sev-medium">{counts.medium || 0} medium</span><span className="sev sev-low">{counts.low || 0} low</span><span className="sev sev-pass">{counts.pass || 0} passed</span></div>
      </section>

      <AiCard audit={audit} />

      <div className="cols">
        <section className="findings">
          <div className="card filters noprint">
            <div className="chips">{['all', 'high', 'medium', 'low'].map((s) => <button key={s} className={`chip ${sev === s ? 'on' : ''}`} onClick={() => setSev(s)}>{s}</button>)}</div>
            <div className="chips">{['all', ...CATS.map((c) => c.key)].map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
            <label className="check"><input type="checkbox" checked={passes} onChange={(e) => setPasses(e.target.checked)} /> show passed checks</label>
          </div>
          {findings.length === 0 ? <Empty title="Nothing to show">No findings match these filters.</Empty> : findings.map((f) => <Finding key={f.id} f={f} />)}
        </section>
        <aside className="side noprint"><Chat auditId={audit.id} initial={audit.chat || []} llm={audit.llm} /></aside>
      </div>
    </div>
  );
}
