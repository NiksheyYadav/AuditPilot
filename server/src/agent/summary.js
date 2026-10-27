import { cfg } from '../config.js';
import { Audit } from '../models/index.js';
import { topFindings } from '../audit/score.js';
import { getProvider } from './llm/index.js';
import { enqueue } from './llm/queue.js';
import { llmHealth } from './health.js';

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}...` : String(s));

export function summaryPrompt(audit) {
  const s = audit.scores;
  const f = topFindings(audit.findings, 10).map((x) => `- id=${x.id} | ${x.severity} | ${x.title} | ${clip(x.evidence, 120)}`).join('\n') || '- (none)';
  return [
    { role: 'system', content: `TASK:SUMMARY\nYou write short website audit reports. Use ONLY the data given. Do not invent numbers.\nFormat exactly:\nSUMMARY: <3 sentences for a non-technical reader>\nFIX PLAN:\n1. <most important fix first> ... (max 5 items, high severity first)\n\nURL: ${audit.url}\nSCORES: overall=${s.overall} seo=${s.seo} accessibility=${s.accessibility} security=${s.security} performance=${s.performance}\nFINDINGS:\n${f}` },
    { role: 'user', content: 'Write the summary and fix plan.' },
  ];
}

export function parseSummary(text) {
  const t = String(text || '').trim();
  const m = /SUMMARY:\s*([\s\S]*?)\s*(?:FIX PLAN:\s*([\s\S]*))?$/i.exec(t);
  return m ? { summary: m[1].trim(), fixPlan: (m[2] || '').trim() } : { summary: t, fixPlan: '' };
}

/** Runs after the audit is saved. Never blocks the audit; sets aiStatus pending -> ready | skipped | failed. */
export async function generateSummary(auditId) {
  const audit = await Audit.findById(auditId);
  if (!audit) return;
  const provider = getProvider();
  if (!provider.mock) {
    const h = await llmHealth({ force: true });
    if (!h.reachable || !h.modelInstalled) { await Audit.updateOne({ _id: auditId }, { aiStatus: 'skipped', aiError: h.error }); return; }
  }
  try {
    const r = await enqueue(() => provider.chat({ messages: summaryPrompt(audit), temperature: 0.1, maxTokens: 450 }), { priority: 0 });
    const { summary, fixPlan } = parseSummary(r.content);
    if (!summary) throw new Error('Model returned an empty summary');
    await Audit.updateOne({ _id: auditId }, { summary, fixPlan, aiStatus: 'ready', aiError: undefined, llm: { provider: provider.name, model: provider.model, mock: provider.mock } });
  } catch (e) {
    await Audit.updateOne({ _id: auditId }, { aiStatus: 'failed', aiError: clip(e.message, 200) });
  }
}

export function scheduleSummary(auditId) {
  setImmediate(() => generateSummary(auditId).catch((e) => console.error('[summary]', e.message)));
}

export { cfg };
