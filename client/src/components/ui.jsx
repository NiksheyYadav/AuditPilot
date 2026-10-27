import { useEffect, useRef, useState } from 'react';
import { scoreColor } from '../lib/util.js';

export const Spinner = ({ label }) => <div className="center-note"><span className="spinner" />{label && <span>{label}</span>}</div>;
export const ErrorBox = ({ children }) => <div className="alert error" role="alert">{children}</div>;
export const Empty = ({ title, children }) => <div className="empty"><h3>{title}</h3><p>{children}</p></div>;
export const SevBadge = ({ sev }) => <span className={`sev sev-${sev}`}>{sev === 'pass' ? 'pass' : sev}</span>;

/** Counts up to `value` for a lively score reveal. */
export function useCountUp(value, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now();
    const tick = (t) => { const p = Math.min(1, (t - t0) / ms); setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return n;
}

export function Gauge({ value, size = 190, label = 'Overall' }) {
  const n = useCountUp(value);
  const r = 78, c = 2 * Math.PI * r, arc = c * 0.75;
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 50); return () => clearTimeout(t); }, []);
  return (
    <div className="gauge" style={{ width: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`${label} score ${value} out of 100`}>
        <circle cx="100" cy="100" r={r} className="g-track" strokeDasharray={`${arc} ${c}`} transform="rotate(135 100 100)" />
        <circle cx="100" cy="100" r={r} className="g-bar" stroke={scoreColor(value)} strokeDasharray={`${on ? arc * (value / 100) : 0} ${c}`} transform="rotate(135 100 100)" />
      </svg>
      <div className="g-center"><b style={{ color: scoreColor(value) }}>{n}</b><span>{label}</span></div>
    </div>
  );
}

export function MiniScore({ label, value }) {
  const n = useCountUp(value, 700);
  return (
    <div className="mini">
      <div className="mini-top"><span>{label}</span><b style={{ color: scoreColor(value) }}>{n}</b></div>
      <div className="bar"><i style={{ width: `${value}%`, background: scoreColor(value) }} /></div>
    </div>
  );
}

/** Tiny markdown subset: paragraphs, lists, **bold**, `code`. Output is React nodes (no innerHTML). */
const inline = (s) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
  p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p);
export function Md({ text }) {
  const out = []; let list = null; let code = null;
  const flush = () => { if (list) { out.push(list.ordered ? <ol key={out.length}>{list.items}</ol> : <ul key={out.length}>{list.items}</ul>); list = null; } };
  (text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('```')) {
      if (code) { out.push(<pre key={`c${i}`} className="md-code"><code>{code.join('\n')}</code></pre>); code = null; } else { flush(); code = []; }
      return;
    }
    if (code) { code.push(raw); return; }
    const m = /^(\d+)[.)]\s+(.*)/.exec(line) || /^[-*]\s+(.*)/.exec(line);
    if (m) {
      const ordered = /^\d/.test(line);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(<li key={i}>{inline(ordered ? m[2] : m[1])}</li>);
    } else { flush(); if (line) out.push(<p key={i}>{inline(line.replace(/^#+\s*/, ''))}</p>); }
  });
  flush();
  if (code) out.push(<pre key="cend" className="md-code"><code>{code.join('
')}</code></pre>);
  return <div className="md">{out}</div>;
}

export function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  const t = useRef();
  return <button className="btn tiny ghost" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); clearTimeout(t.current); t.current = setTimeout(() => setOk(false), 1200); }}>{ok ? 'Copied' : 'Copy'}</button>;
}
