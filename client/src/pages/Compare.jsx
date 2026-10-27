import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { CATS, fmtDate, host, scoreColor } from '../lib/util.js';
import { Empty, ErrorBox, SevBadge, Spinner } from '../components/ui.jsx';

const Delta = ({ v }) => <b className={`delta ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{v > 0 ? `+${v}` : v}</b>;

export default function Compare() {
  const [sp, setSp] = useSearchParams();
  const a = sp.get('a') || '', b = sp.get('b') || '';
  const [list, setList] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api.listAudits().then((r) => setList(r.audits)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    setRes(null); setErr('');
    if (a && b) api.compare(a, b).then(setRes).catch((e) => setErr(e.message));
  }, [a, b]);

  const pick = (k) => (e) => { const n = new URLSearchParams(sp); n.set(k, e.target.value); setSp(n); };
  const opt = (x) => <option key={x.id} value={x.id}>{host(x.url)} - score {x.scores.overall} - {fmtDate(x.createdAt)}</option>;

  if (!list && !err) return <Spinner label="Loading..." />;
  return (
    <div className="stack">
      <section className="card">
        <h1>Compare audits</h1>
        <div className="cmp-pick">
          <label>Before (A)<select value={a} onChange={pick('a')}><option value="">Select...</option>{list?.map(opt)}</select></label>
          <label>After (B)<select value={b} onChange={pick('b')}><option value="">Select...</option>{list?.map(opt)}</select></label>
        </div>
      </section>
      {err && <ErrorBox>{err}</ErrorBox>}
      {!a || !b ? <Empty title="Pick two audits">Choose a "before" and an "after" audit, for example the bad and good demo pages.</Empty> : null}
      {a && b && !res && !err && <Spinner label="Comparing..." />}
      {res && (
        <>
          <section className="card cmp-scores">
            <div className="cmp-col"><span className="muted small">A: {host(res.a.url)}</span><div className="big" style={{ color: scoreColor(res.a.scores.overall) }}>{res.a.scores.overall}</div></div>
            <div className="cmp-mid"><Delta v={res.deltas.overall} /><span className="muted small">overall</span></div>
            <div className="cmp-col"><span className="muted small">B: {host(res.b.url)}</span><div className="big" style={{ color: scoreColor(res.b.scores.overall) }}>{res.b.scores.overall}</div></div>
            <table className="table full">
              <thead><tr><th>Category</th><th>A</th><th>B</th><th>Change</th></tr></thead>
              <tbody>{CATS.map((c) => <tr key={c.key}><td>{c.label}</td><td>{res.a.scores[c.key]}</td><td>{res.b.scores[c.key]}</td><td><Delta v={res.deltas[c.key]} /></td></tr>)}</tbody>
            </table>
          </section>
          <div className="cmp-lists">
            <section className="card"><h2>Fixed in B <span className="count good">{res.fixed.length}</span></h2>
              {res.fixed.length === 0 ? <p className="muted">Nothing was fixed.</p> : res.fixed.map((f) => <div key={f.id} className="cmp-item"><SevBadge sev={f.severity} /> {f.title}</div>)}</section>
            <section className="card"><h2>New issues in B <span className="count bad">{res.newIssues.length}</span></h2>
              {res.newIssues.length === 0 ? <p className="muted">No new issues.</p> : res.newIssues.map((f) => <div key={f.id} className="cmp-item"><SevBadge sev={f.severity} /> {f.title}</div>)}
              <p className="muted small">Still open in both: {res.stillOpenCount}</p></section>
          </div>
          <div className="row gap"><Link className="btn ghost" to={`/audits/${res.a.id}`}>Open A</Link><Link className="btn ghost" to={`/audits/${res.b.id}`}>Open B</Link></div>
        </>
      )}
    </div>
  );
}
