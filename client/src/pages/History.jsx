import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDate, host, scoreColor } from '../lib/util.js';
import { Empty, ErrorBox, Spinner } from '../components/ui.jsx';

const PAGE_SIZE = 15;

export default function History() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => api.listAudits({ q: query, page, limit: PAGE_SIZE }).then((r) => { setData(r); setErr(''); }).catch((e) => setErr(e.message)), [query, page]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => Object.fromEntries((data?.audits || []).map((a) => [a.id, a])), [data]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));

  function compare() {
    const [x, y] = picked.map((id) => byId[id]).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    nav(`/compare?a=${x.id}&b=${y.id}`);
  }
  async function remove(a) {
    if (!window.confirm(`Delete the audit of ${host(a.url)} from ${fmtDate(a.createdAt)}? Its chat history is deleted too.`)) return;
    try { await api.deleteAudit(a.id); setPicked((p) => p.filter((x) => x !== a.id)); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap gap">
          <div><h1>Audit history</h1><p className="muted">Every audit and its saved chat. Open one to continue the conversation, or tick two to compare them.</p></div>
          <div className="row gap wrap">
            <button className="btn primary" disabled={picked.length !== 2} onClick={compare}>Compare selected ({picked.length}/2)</button>
          </div>
        </div>
        <input className="hist-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by URL, e.g. nikshey.xyz" aria-label="Search history" />
      </section>

      {err && <ErrorBox>{err}</ErrorBox>}
      {!data && !err && <Spinner label="Loading history..." />}
      {data && data.total === 0 && <Empty title={query ? 'No audits match your search' : 'No history yet'}>{query ? 'Try a different part of the URL.' : 'Run your first audit from the dashboard and it will appear here.'}</Empty>}

      {data && data.total > 0 && (
        <section className="card">
          <div className="muted small">{data.total} audit{data.total === 1 ? '' : 's'}{query ? ` matching "${query}"` : ''}</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th aria-label="Select" /><th>URL</th><th>Score</th><th>Issues</th><th>AI</th><th>Chat</th><th>When</th><th /></tr></thead>
              <tbody>
                {data.audits.map((a) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${host(a.url)}`} /></td>
                    <td><Link to={`/audits/${a.id}`} className="url-link">{host(a.url)}</Link>{a.rendered && <span className="badge live tiny-badge">JS</span>}</td>
                    <td><span className="score-pill" style={{ background: scoreColor(a.scores.overall) }}>{a.scores.overall}</span></td>
                    <td>{a.issues}</td>
                    <td><span className={`ai-st ${a.aiStatus}`}>{a.seeded ? 'sample' : a.aiStatus}</span></td>
                    <td className="muted">{a.chatCount ? `${a.chatCount} msg` : '-'}</td>
                    <td className="muted">{fmtDate(a.createdAt)}</td>
                    <td className="nowrap"><Link className="btn ghost small" to={`/audits/${a.id}`}>Open</Link> <button className="btn ghost small danger" onClick={() => remove(a)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <div className="row between pager">
              <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="muted small">Page {data.page} of {data.pages}</span>
              <button className="btn ghost small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
