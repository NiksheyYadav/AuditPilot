// Deterministic scripted provider (LLM_PROVIDER=mock). NOT a real model: the UI shows a MOCK LLM badge whenever it is active.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function emit(text, onToken) {
  if (!onToken) return;
  for (const w of text.match(/\S+\s*/g) || []) { onToken(w); await sleep(4); }
}

const section = (sys, name) => {
  const m = new RegExp(`${name}:\\n([\\s\\S]*?)(?:\\n\\n|$)`).exec(sys);
  return m ? m[1].split('\n').filter((l) => l.startsWith('- ')) : [];
};
const parseFinding = (l) => {
  const p = l.slice(2).split(' | ');
  if (p[0].startsWith('id=')) { const [id, sev, title, ...ev] = p; return { id: id.slice(3), sev, title, evidence: ev.join(' | ') }; }
  const [sev, title, ...ev] = p; return { id: title, sev, title, evidence: ev.join(' | ') };
};

function summaryText(sys) {
  const scores = /SCORES: (.*)/.exec(sys)?.[1] || '';
  const f = section(sys, 'FINDINGS').map(parseFinding);
  const overall = /overall=(\d+)/.exec(scores)?.[1] ?? '?';
  const top = f.slice(0, 3).map((x) => x.title).join(', ') || 'none';
  return `SUMMARY: [MOCK LLM] The site scored ${overall}/100 overall (${scores}). The most important problems are: ${top}.\nFIX PLAN:\n` +
    (f.slice(0, 5).map((x, i) => `${i + 1}. **${x.title}** (${x.sev}) - ${x.evidence}`).join('\n') || '1. Nothing to fix.');
}

export function createMockProvider() {
  if (process.env.LLM_MOCK_FAIL === 'true') {
    return { name: 'mock', model: 'scripted-mock', mock: true, async chat() { throw new Error('mock provider forced failure'); } };
  }
  return {
    name: 'mock', model: 'scripted-mock', mock: true,
    async chat({ messages, tools, onToken }) {
      const sys = messages[0].content;
      if (sys.includes('TASK:SUMMARY')) { const t = summaryText(sys); await emit(t, onToken); return { content: t, toolCalls: [] }; }
      const last = messages.at(-1);
      const call = (name, args) => ({ content: '', toolCalls: [{ id: `mock_${name}`, name, arguments: JSON.stringify(args) }] });
      const answer = async (t) => { await emit(t, onToken); return { content: t, toolCalls: [] }; };
      const findings = section(sys, 'TOP FINDINGS').map(parseFinding);

      if (last.role === 'tool') {
        const user = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';
        if (user.includes('__bad_args__') && tools?.length) return call('get_audit', { audit_id: 123 });
        if (user.includes('__loop__') && tools?.length) return call('list_my_audits', {});
        return answer(`[MOCK LLM] I used a tool and got: ${String(last.content).slice(0, 300)}`);
      }
      const u = last.content.toLowerCase();
      if (!tools?.length) return answer(`[MOCK LLM] Answering from the audit data only. Top issues: ${findings.slice(0, 3).map((f) => f.title).join(', ') || 'none'}.`);
      if (u.includes('__bad_args__')) return call('get_audit', { audit_id: 123 });
      if (u.includes('__loop__')) return call('list_my_audits', {});
      if (/compare|previous|history|earlier|other audits/.test(u)) return call('list_my_audits', { limit: 5 });
      if (/snippet|remediation|code|how do i fix/.test(u) && findings[0]) return call('get_remediation', { check_id: findings[0].id });
      if (/fix|first|priorit|important|start/.test(u)) {
        return answer('[MOCK LLM] Fix in this order:\n' + (findings.slice(0, 4).map((f, i) => `${i + 1}. **${f.title}** (${f.sev}) - ${f.evidence}`).join('\n') || '1. Nothing to fix.'));
      }
      return answer(`[MOCK LLM] ${/SCORES: (.*)/.exec(sys)?.[1] || 'Scores are in the report'}. Ask me what to fix first.`);
    },
  };
}
