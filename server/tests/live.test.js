// Opt-in tests against the REAL local model (Ollama). Run: npm run test:live
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startDb, stopDb, makeApp, register, listen } from './helpers.js';
import { Audit } from '../src/models/index.js';
import { createAudit } from '../src/services/auditService.js';
import { generateSummary } from '../src/agent/summary.js';
import { runAgent } from '../src/agent/agent.js';
import { llmHealth, warmModel } from '../src/agent/health.js';

process.env.ALLOW_PRIVATE_TARGETS = 'true';
let app, srv, base, ok = false;
beforeAll(async () => {
  await startDb(); app = makeApp(); ({ server: srv, base } = await listen(app));
  const h = await llmHealth({ force: true }); ok = h.reachable && h.modelInstalled;
  if (ok) await warmModel();
}, 300000);
afterAll(async () => { srv.close(); await stopDb(); });

describe('real local model', () => {
  it('Ollama is reachable and the model is installed', () => { expect(ok, 'start Ollama and pull the model first').toBe(true); });

  it('writes a grounded summary and fix plan for a real audit', async () => {
    const u = await register(app);
    const audit = await createAudit(u.user.id, `${base}/demo/bad`, { ai: false });
    await Audit.updateOne({ _id: audit._id }, { aiStatus: 'pending' });
    await generateSummary(audit._id);
    const done = await Audit.findById(audit._id);
    expect(done.aiStatus).toBe('ready'); expect(done.llm.mock).toBe(false);
    expect(done.summary.length).toBeGreaterThan(40);
    expect(/title|https|content-security|alt|label|h1|meta|viewport|language/i.test(done.summary + done.fixPlan)).toBe(true);
    console.log('[live] summary:', done.summary.slice(0, 200));
  });

  it('answers from the preloaded audit context, streaming tokens', async () => {
    const u = await register(app);
    const audit = await createAudit(u.user.id, `${base}/demo/bad`, { ai: false });
    const events = [];
    const msg = await runAgent({ audit, userId: u.user.id, message: 'What should I fix first?', emit: (e, d) => events.push([e, d]) });
    expect(msg.content.length).toBeGreaterThan(20);
    expect(events.filter(([e]) => e === 'token').length).toBeGreaterThan(1);
    expect(events.at(-1)[0]).toBe('done');
    console.log('[live] answer:', msg.content.slice(0, 200));
  });

  it('uses a tool when the question needs history', async () => {
    const u = await register(app);
    await createAudit(u.user.id, `${base}/demo/good`, { ai: false });
    const audit = await createAudit(u.user.id, `${base}/demo/bad`, { ai: false });
    const msg = await runAgent({ audit, userId: u.user.id, message: 'Compare this audit with my previous audit.', emit: () => {} });
    console.log('[live] tools used:', msg.toolCalls.map((t) => `${t.name}${t.error ? ' (error)' : ''}`).join(', ') || 'none');
    expect(msg.toolCalls.length).toBeGreaterThan(0);
    expect(msg.toolCalls.some((t) => !t.error)).toBe(true);
    expect(msg.content.length).toBeGreaterThan(20);
  });
});
