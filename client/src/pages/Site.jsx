import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { CATS, download, fmtDate, host, scoreColor } from '../lib/util.js';
import { ErrorBox, Gauge, MiniScore, Spinner } from '../components/ui.jsx';
import Finding from '../components/Finding.jsx';
import { AiCard } from './Report.jsx';

const path = (u) => { try { const x = new URL(u); return x.pathname + x.search || '/'; } catch { return u; } };

function toMarkdown(s) {
  const L = [`# Site audit: ${s.url}`, '', `- Pages audited: ${s.pages.length}`, `- Overall: **${s.scores.overall}/100**`, ...CATS.map((c) => `- ${c.label}: ${s.scores[c.key]}/100`), ''];
  if (s.summary) L.push('## Summary', '', s.summary, '');
  if (s.fixPlan) L.push('## Fix plan', '', s.fixPlan, '');
  L.push('## Site-wide findings', '', ...s.crossFindings.map((f) => `- [${f.severity.toUpperCase()}] ${f.title}: ${f.evidence}`), '', '## Pages', '', '| Page | Score | Issues |', '|---|---|---|', ...s.pages.map((p) => `| ${path(p.url)} | ${p.scores.overall} | ${p.issues} |`));
  return L.join('\n');
}

export default function Site() {
  const { id } = useParams();
  const nav = useNavigate();
  const [site, setSite] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.getSite(id).then(setSite).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { setSite(null); load(); }, [load]);
  const busy = site && (site.status === 'running' || site.aiStatus === 'pending');
  useEffect(() => { if (!busy) return undefined; const t = setInterval(load, 1500); return () => clearInterval(t); }, [busy, load]);

  if (err) return <div className="stack"><ErrorBox>{err}</ErrorBox><Link to="/" className="btn ghost">Back to dashboard</Link></div>;
  if (!site) return <Spinner label="Loading site audit..." />;
  const pct = site.maxPages ? Math.min(100, Math.round((site.pages.length / site.maxPages) * 100)) : 0;

  return (
    <div className="report">
      <div className="row between wrap gap">
        <div><Link to="/" className="muted small">&larr; Dashboard</Link>
          <h1 className="url-title">Site audit: {host(site.url)}</h1>
          <p className="muted small">{site.rendered && <span className="badge live">JS rendered</span>} {fmtDate(site.createdAt)} &middot; up to {site.maxPages} pages{site.durationMs ? ` · crawled in ${(site.durationMs / 1000).toFixed(1)} s` : ''}</p></div>
        {site.status === 'done' && <div className="row gap wrap">
          <button className="btn ghost" onClick={() => download(`site-audit-${host(site.url).replace(/[^a-z0-9]+/gi, '-')}.md`, toMarkdown(site))}>Export Markdown</button>
          <button className="btn ghost danger" onClick={async () => { if (window.confirm('Delete this site audit and all its page audits?')) { await api.deleteSite(site.id); nav('/'); } }}>Delete</button>
        </div>}
      </div>

      {site.status === 'failed' && <ErrorBox>The site audit failed: {site.error}</ErrorBox>}

      {site.status === 'running' && (
        <section className="card">
          <h2>Crawling...</h2>
          <div className="bar big"><i style={{ width: `${Math.max(pct, 4)}%`, background: 'var(--primary)' }} /></div>
          <p className="muted small"><span className="dots"><i /><i /><i /></span> {site.pages.length} page{site.pages.length === 1 ? '' : 's'} audited{site.progress?.current ? ` · now ${path(site.progress.current)}` : ''}. Pages appear below as they finish.</p>
        </section>
      )}

      {site.status === 'done' && (
        <>
          <section className="card scores">
            <Gauge value={site.scores.overall} label="Site" />
            <div className="mini-grid">{CATS.map((c) => <MiniScore key={c.key} label={c.label} value={site.scores[c.key]} />)}</div>
            <div className="sev-sum"><span className="sev sev-low">{site.pages.length} pages</span>
              {site.broken.length > 0 && <span className="sev sev-high">{site.broken.length} broken</span>}
              {site.skipped.length > 0 && <span className="sev sev-medium">{site.skipped.length} skipped</span>}</div>
          </section>
          <AiCard audit={site} title="AI site summary and fix plan" />
          <section className="stack">
            <h2>Site-wide findings</h2>
            {site.crossFindings.map((f) => <Finding key={f.id} f={f} />)}
            {(site.broken.length > 0 || site.skipped.length > 0) && (
              <div className="card small">
                {site.broken.map((b) => <div key={b.url}><b>Broken:</b> {path(b.url)} ({b.status || 'error'}), linked from {path(b.from)}</div>)}
                {site.skipped.map((k, i) => <div key={i} className="muted"><b>Skipped:</b> {path(k.url)} ({k.reason})</div>)}
              </div>
            )}
          </section>
        </>
      )}

      {site.pages.length > 0 && (
        <section className="card">
          <h2>Pages</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Page</th><th>Title</th><th>Score</th><th>Issues</th><th /></tr></thead>
              <tbody>
                {[...site.pages].sort((a, b) => a.scores.overall - b.scores.overall).map((p) => (
                  <tr key={p.url}>
                    <td><Link className="url-link" to={`/audits/${p.audit}`}>{path(p.url)}</Link></td>
                    <td className="muted">{p.title || '(no title)'}</td>
                    <td><span className="score-pill" style={{ background: scoreColor(p.scores.overall) }}>{p.scores.overall}</span></td>
                    <td>{p.issues}</td>
                    <td><Link className="btn ghost small" to={`/audits/${p.audit}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Worst pages first. Each page is a full audit: open it for findings, fix snippets and chat.</p>
        </section>
      )}
    </div>
  );
}
