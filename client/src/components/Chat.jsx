import { useEffect, useRef, useState } from 'react';
import { api, streamChat } from '../lib/api.js';
import { Md } from './ui.jsx';

const SUGGESTIONS = ['What should I fix first?', 'Explain the security score', 'How does this compare with my previous audits?'];

function ToolTrace({ calls }) {
  if (!calls?.length) return null;
  return (
    <details className="trace">
      <summary>Tool trace ({calls.length} call{calls.length > 1 ? 's' : ''})</summary>
      {calls.map((c, i) => (
        <div className="trace-row" key={i}>
          <div><code>{c.name}</code>{c.pending ? <span className="muted"> running...</span> : <span className="muted"> {c.ms} ms</span>}</div>
          <div className="muted small">args: {JSON.stringify(c.args)}</div>
          {!c.pending && <div className={`small ${c.error ? 'err' : ''}`}>{c.error ? `error: ${c.error}` : `result: ${c.resultSummary}`}</div>}
        </div>
      ))}
    </details>
  );
}

export default function Chat({ auditId, initial = [], llm }) {
  const [msgs, setMsgs] = useState(() => initial.map((m) => ({ ...m })));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    if (!busy) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const patchLast = (fn) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = fn({ ...c[c.length - 1] }); return c; });

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    setInput(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '', toolCalls: [], thinking: true }]);
    try {
      await streamChat(auditId, text, (ev, d) => {
        if (ev === 'token') patchLast((m) => ({ ...m, thinking: false, content: m.content + d.text }));
        else if (ev === 'tool_call') patchLast((m) => ({ ...m, toolCalls: [...m.toolCalls, { name: d.name, args: d.args, pending: true }] }));
        else if (ev === 'tool_result') patchLast((m) => ({ ...m, toolCalls: m.toolCalls.map((c) => (c.pending && c.name === d.name ? { ...c, pending: false, resultSummary: d.summary, ms: d.ms, error: d.error } : c)) }));
        else if (ev === 'note') patchLast((m) => ({ ...m, note: d.text }));
        else if (ev === 'error') patchLast((m) => ({ ...m, thinking: false, content: m.content || '', error: d.message }));
        else if (ev === 'done') patchLast((m) => ({ ...m, thinking: false, content: m.content || d.content || m.content }));
      });
    } catch (e) {
      const gone = e.status === 404;
      patchLast((m) => ({ ...m, thinking: false, error: gone ? 'This audit no longer exists (it was deleted, or the demo database was reset). Open History to pick another audit.' : e.message }));
    } finally {
      patchLast((m) => ({ ...m, thinking: false }));
      setBusy(false);
    }
  }

  return (
    <section className="card chat" aria-label="Ask the audit agent">
      <div className="chat-head">
        <h2>Ask the audit agent</h2>
        <span className="muted small">{llm?.mock ? 'Scripted mock replies' : `Runs locally on ${llm?.model || 'your machine'}`}</span>
        {msgs.length > 0 && !busy && <button className="btn ghost tiny" onClick={async () => { if (window.confirm('Clear the saved chat history for this audit?')) { try { await api.clearChat(auditId); setMsgs([]); } catch { /* shown on next send */ } } }}>Clear chat</button>}
      </div>
      <div className="chat-body">
        {!msgs.length && (
          <div className="chat-empty">
            <p>The agent already knows this report. Ask a question, or try:</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' && <ToolTrace calls={m.toolCalls} />}
            {m.thinking && (
              <div className="thinking"><span className="dots"><i /><i /><i /></span> {m.toolCalls?.some((c) => c.pending) ? 'Running a tool' : 'Thinking'}... {secs}s
                {secs > 12 && <span className="muted small"> (local models on CPU can take a while)</span>}</div>
            )}
            {m.content && (m.role === 'assistant' ? <Md text={m.content} /> : <p>{m.content}</p>)}
            {m.note && <div className="alert note">{m.note}</div>}
            {m.error && <div className="alert error">{m.error}</div>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask about this audit..." aria-label="Message" disabled={busy} />
        <button className="btn primary" disabled={busy || !input.trim()}>{busy ? '...' : 'Send'}</button>
      </form>
    </section>
  );
}
