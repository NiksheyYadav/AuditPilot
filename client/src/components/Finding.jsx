import { useState } from 'react';
import { CopyBtn, SevBadge } from './ui.jsx';

export default function Finding({ f }) {
  const [open, setOpen] = useState(f.severity === 'high');
  return (
    <article className={`finding ${open ? 'open' : ''} f-${f.severity}`}>
      <button className="f-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <SevBadge sev={f.severity} />
        <span className="f-title">{f.title}</span>
        <span className="f-cat">{f.category}</span>
        <span className="chev" aria-hidden>{open ? '-' : '+'}</span>
      </button>
      <div className="f-body">
        <p><b>Evidence.</b> {f.evidence}</p>
        {f.severity !== 'pass' && <p><b>Recommendation.</b> {f.recommendation}</p>}
        {f.severity !== 'pass' && f.fix?.snippets?.map((s, i) => (
          <div className="snippet" key={i}>
            <div className="snippet-head"><span>{s.label}</span><CopyBtn text={s.code} /></div>
            <pre><code>{s.code}</code></pre>
          </div>
        ))}
      </div>
    </article>
  );
}
