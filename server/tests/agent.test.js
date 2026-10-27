import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startDb, stopDb, clearDb, makeApp, register, authed, listen } from './helpers.js';
import { Audit } from '../src/models/index.js';
import { runAgent, MAX_STEPS } from '../src/agent/agent.js';
import { executeTool, TOOLS, toOpenAiTools } from '../src/agent/tools.js';
import { createAudit } from '../src/services/auditService.js';
import { generateSummary, parseSummary } from '../src/agent/summary.js';

process.env.LLM_PROVIDER = 'mock';
process.env.ALLOW_PRIVATE_TARGETS = 'true';

let app, srv, base;
beforeAll(async () => { await startDb(); app = makeApp({ auditRateLimit: 100, chatRateLimit: 100 }); ({ server: srv, base } = await listen(app)); });
afterAll(async () => { srv.close(); await stopDb(); });
beforeEach(async () => { await clearDb(); process.env.LLM_PROVIDER = 'mock'; delete process.env.LLM_MOCK_FAIL; });

const setup = async () => {
  const u = await register(app);
  const audit = await createAudit(u.user.id, `${base}/demo/bad`, { ai: false });
  return { u, audit };
};
const collect = () => { const ev = []; return { ev, emit: (e, d) => ev.push([e, d]), of: (n) => ev.filter(([e]) => e === n).map(([, d]) => d) }; };

describe('tool registry', () => {
  it('exposes at most 5 tools with short descriptions', () => {
    expect(TOOLS.length).toBeLessThanOrEqual(5);
    TOOLS.forEach((t) => expect(t.description.length).toBeLessThan(110));
    expect(toOpenAiTools().map((t) => t.function.name)).toEqual(['run_audit', 'get_audit', 'list_my_audits', 'compare_audits', 'get_remediation']);
  });
  it('rejects invalid and malformed arguments', async () => {
    const ctx = { userId: 'x' };
    expect((await executeTool('get_audit', { audit_id: 123 }, ctx)).error).toMatch(/Invalid arguments/);
    expect((await executeTool('get_audit', '{not json', ctx)).error).toMatch(/not valid JSON/);
    expect((await executeTool('nope', {}, ctx)).error).toMatch(/Unknown tool/);
    expect((await executeTool('get_remediation', { check_id: 'nonexistent-check' }, ctx)).ok).toBe(false);
  });
  it('get_remediation works without any LLM', async () => {
    const r = await executeTool('get_remediation', { check_id: 'sec-csp' }, { userId: 'x' });
    expect(r.ok).toBe(true); expect(r.result.snippets.length).toBeGreaterThan(0);
  });
  it('run_audit goes through the SSRF guard', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'false';
    const { u } = await setup().catch(async () => ({ u: await register(app) }));
    const r = await executeTool('run_audit', { url: 'http://169.254.169.254/latest/meta-data' }, { userId: u.user.id });
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    expect(r.ok).toBe(false); expect(r.error).toMatch(/Blocked/);
  });
  it("agent tools cannot read another user's audit", async () => {
    const { audit } = await setup();
    const other = await register(app);
    const r = await executeTool('get_audit', { audit_id: String(audit._id) }, { userId: other.user.id });
    expect(r.ok).toBe(false); expect(r.error).toMatch(/not found/i);
    const c = await executeTool('compare_audits', { audit_id_a: String(audit._id), audit_id_b: String(audit._id) }, { userId: other.user.id });
    expect(c.ok).toBe(false);
  });
});

describe('agent loop (mock LLM)', () => {
  it('answers from preloaded context without a tool call', async () => {
    const { u, audit } = await setup(); const c = collect();
    const msg = await runAgent({ audit, userId: u.user.id, message: 'What should I fix first?', emit: c.emit });
    expect(msg.toolCalls).toHaveLength(0);
    expect(msg.content).toMatch(/Fix in this order/);
    expect(c.of('token').length).toBeGreaterThan(1); expect(c.of('done')).toHaveLength(1);
  });
  it('calls a tool, then answers', async () => {
    const { u, audit } = await setup(); const c = collect();
    const msg = await runAgent({ audit, userId: u.user.id, message: 'compare with my previous audits', emit: c.emit });
    expect(c.of('tool_call')[0].name).toBe('list_my_audits');
    expect(c.of('tool_result')[0].summary).toMatch(/1 audits/);
    expect(msg.toolCalls[0]).toMatchObject({ name: 'list_my_audits' });
    expect(msg.toolCalls[0].ms).toBeGreaterThanOrEqual(0);
    expect(msg.content).toMatch(/used a tool/);
  });
  it('feeds invalid args back once, then answers gracefully with a visible note', async () => {
    const { u, audit } = await setup(); const c = collect();
    const msg = await runAgent({ audit, userId: u.user.id, message: '__bad_args__', emit: c.emit });
    const results = c.of('tool_result');
    expect(results).toHaveLength(2); results.forEach((r) => expect(r.error).toMatch(/Invalid arguments/));
    expect(msg.note).toMatch(/valid tool arguments/); expect(c.of('note')).toHaveLength(1);
    expect(msg.content.length).toBeGreaterThan(5);
  });
  it('stops at the 5-step cap', async () => {
    const { u, audit } = await setup(); const c = collect();
    const msg = await runAgent({ audit, userId: u.user.id, message: '__loop__', emit: c.emit });
    expect(c.of('tool_call')).toHaveLength(MAX_STEPS);
    expect(msg.note).toMatch(/Stopped after 5/);
  });
});

describe('chat endpoint (SSE)', () => {
  it('streams events and persists the conversation with the tool trace', async () => {
    const { u, audit } = await setup(); const a = authed(app, u.token);
    const r = await a.post(`/api/audits/${audit._id}/chat`).send({ message: 'compare with previous' }).buffer().parse((res, cb) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => cb(null, d)); });
    expect(r.status).toBe(200); expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    expect(r.body).toMatch(/event: tool_call/); expect(r.body).toMatch(/event: token/); expect(r.body).toMatch(/event: done/);
    const saved = await Audit.findById(audit._id);
    expect(saved.chat.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(saved.chat[1].toolCalls[0].name).toBe('list_my_audits');
  });
  it('enforces ownership, length cap and validation', async () => {
    const { u, audit } = await setup(); const other = authed(app, (await register(app)).token);
    expect((await other.post(`/api/audits/${audit._id}/chat`).send({ message: 'hi' })).status).toBe(404);
    const a = authed(app, u.token);
    expect((await a.post(`/api/audits/${audit._id}/chat`).send({ message: 'x'.repeat(501) })).status).toBe(400);
    expect((await a.post(`/api/audits/${audit._id}/chat`).send({})).status).toBe(400);
    expect((await request(app).post(`/api/audits/${audit._id}/chat`).send({ message: 'hi' })).status).toBe(401);
  });
  it('rate limits chat per user', async () => {
    const limited = makeApp({ chatRateLimit: 1 });
    const { u, audit } = await setup(); const a = authed(limited, u.token);
    const first = await a.post(`/api/audits/${audit._id}/chat`).send({ message: 'hi' }).buffer().parse((res, cb) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => cb(null, d)); });
    expect(first.status).toBe(200);
    expect((await a.post(`/api/audits/${audit._id}/chat`).send({ message: 'hi' })).status).toBe(429);
  });
  it('reports a clear error when the local LLM is unreachable', async () => {
    process.env.LLM_PROVIDER = 'ollama'; process.env.LLM_BASE_URL = 'http://127.0.0.1:9/v1';
    const { u, audit } = await setup();
    const r = await authed(app, u.token).post(`/api/audits/${audit._id}/chat`).send({ message: 'hi' }).buffer().parse((res, cb) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => cb(null, d)); });
    delete process.env.LLM_BASE_URL;
    expect(r.body).toMatch(/event: error/); expect(r.body).toMatch(/not reachable/);
  });
});

describe('background summary status transitions', () => {
  const settle = async (id, ms = 8000) => { const t0 = Date.now(); for (;;) { const a = await Audit.findById(id); if (a.aiStatus !== 'pending' || Date.now() - t0 > ms) return a; await new Promise((r) => setTimeout(r, 50)); } };
  it('audit returns instantly as pending, then becomes ready', async () => {
    const u = await register(app);
    const audit = await createAudit(u.user.id, `${base}/demo/good`);
    expect(audit.aiStatus).toBe('pending'); expect(audit.summary).toBe('');
    const done = await settle(audit._id);
    expect(done.aiStatus).toBe('ready'); expect(done.summary).toMatch(/MOCK LLM/); expect(done.llm.mock).toBe(true);
    expect(done.fixPlan.length).toBeGreaterThan(0);
  });
  it('is skipped when the local LLM is not reachable (audit still complete)', async () => {
    process.env.LLM_PROVIDER = 'ollama'; process.env.LLM_BASE_URL = 'http://127.0.0.1:9/v1';
    const u = await register(app);
    const audit = await createAudit(u.user.id, `${base}/demo/bad`);
    const done = await settle(audit._id);
    delete process.env.LLM_BASE_URL;
    expect(done.aiStatus).toBe('skipped'); expect(done.scores.overall).toBeLessThan(60); expect(done.findings).toHaveLength(29);
  });
  it('is failed when the model errors', async () => {
    process.env.LLM_MOCK_FAIL = 'true';
    const u = await register(app);
    const audit = await createAudit(u.user.id, `${base}/demo/bad`);
    const done = await settle(audit._id);
    expect(done.aiStatus).toBe('failed'); expect(done.aiError).toMatch(/forced failure/);
  });
  it('parses the summary format', () => {
    expect(parseSummary('SUMMARY: Hello there.\nFIX PLAN:\n1. A\n2. B')).toEqual({ summary: 'Hello there.', fixPlan: '1. A\n2. B' });
    expect(parseSummary('just text').summary).toBe('just text');
  });
  it('generateSummary ignores a missing audit', async () => { await expect(generateSummary('64b64b64b64b64b64b64b64b')).resolves.toBeUndefined(); });
});
