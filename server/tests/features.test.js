import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startDb, stopDb, clearDb, makeApp, register, authed, listen } from './helpers.js';
import { Audit, Schedule } from '../src/models/index.js';
import { findBrowser } from '../src/audit/render.js';
import { buildCtx, runChecks } from '../src/audit/checks.js';
import { createAudit, findOwned } from '../src/services/auditService.js';
import { runDueSchedules } from '../src/services/scheduler.js';
import { executeTool } from '../src/agent/tools.js';

process.env.LLM_PROVIDER = 'mock';
process.env.ALLOW_PRIVATE_TARGETS = 'true';

let app, srv, base;
beforeAll(async () => { await startDb(); app = makeApp({ auditRateLimit: 100 }); ({ server: srv, base } = await listen(app)); });
afterAll(async () => { srv.close(); await stopDb(); });
beforeEach(clearDb);

describe.skipIf(!findBrowser())('JavaScript rendering (headless Chrome/Edge)', () => {
  it('a plain audit misses client-rendered content, a rendered audit sees it', async () => {
    const { token } = await register(app); const a = authed(app, token);
    const plain = (await a.post('/api/audits').send({ url: `${base}/demo/spa` })).body;
    const rendered = (await a.post('/api/audits').send({ url: `${base}/demo/spa`, render: true })).body;
    const sev = (au, id) => au.findings.find((x) => x.id === id).severity;
    expect(plain.rendered).toBe(false); expect(rendered.rendered).toBe(true);
    expect(sev(plain, 'seo-h1')).toBe('high'); expect(sev(rendered, 'seo-h1')).toBe('pass');
    expect(sev(plain, 'seo-title')).toBe('high'); expect(sev(rendered, 'seo-title')).toBe('pass');
    expect(rendered.scores.overall).toBeGreaterThan(plain.scores.overall);
  }, 60000);
  it('health reports that rendering is available', async () => {
    expect((await request(app).get('/api/health')).body.renderAvailable).toBe(true);
  });
});

describe('link cap', () => {
  it('is configurable and reports how many links were found', async () => {
    const html = `<html><body>${Array.from({ length: 70 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join('')}</body></html>`;
    const seen = [];
    const probe = async (u) => { seen.push(u); return { status: 200 }; };
    const run = async (maxLinks) => (await runChecks(buildCtx({ url: 'https://example.com/', html, probe, maxLinks }))).find((x) => x.id === 'seo-broken-links');
    expect((await run(50)).evidence).toMatch(/50 same-origin links checked \(of 70 found\)/);
    seen.length = 0; await run(10);
    expect(seen.filter((u) => u.includes('/p'))).toHaveLength(10);
  });
});

describe('short audit refs (small-model friendly ids)', () => {
  it("resolves a unique prefix of the caller's own audits only", async () => {
    const A = await register(app), B = await register(app);
    const audit = await createAudit(A.user.id, `${base}/demo/good`, { ai: false });
    const ref = String(audit._id).slice(0, 8);
    expect(String((await findOwned(A.user.id, ref))._id)).toBe(String(audit._id));
    await expect(findOwned(B.user.id, ref)).rejects.toMatchObject({ status: 404 });
    await expect(findOwned(A.user.id, 'abc')).rejects.toMatchObject({ status: 404 });
    expect((await executeTool('get_audit', { audit_id: ref }, { userId: A.user.id })).ok).toBe(true);
  });
});

describe('scheduled audits', () => {
  it('creates, runs when due, reschedules, and enforces limits and ownership', async () => {
    const { token, user } = await register(app); const a = authed(app, token);
    const created = await a.post('/api/schedules').send({ url: `${base}/demo/good`, everyHours: 6 });
    expect(created.status).toBe(201);
    expect(await runDueSchedules(new Date(Date.now() - 3600_000))).toBe(0);
    expect(await runDueSchedules()).toBe(1);
    const s = await Schedule.findById(created.body.id);
    expect(s.lastAuditId).toBeTruthy(); expect(s.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 5 * 3600_000);
    expect(await Audit.countDocuments({ user: user.id })).toBe(1);
    expect(await runDueSchedules()).toBe(0);
    expect((await a.get('/api/schedules')).body.schedules).toHaveLength(1);
    const other = authed(app, (await register(app)).token);
    expect((await other.delete(`/api/schedules/${created.body.id}`)).status).toBe(404);
    expect((await a.delete(`/api/schedules/${created.body.id}`)).status).toBe(204);
    for (let i = 0; i < 5; i++) await a.post('/api/schedules').send({ url: `${base}/demo/bad`, everyHours: 24 });
    expect((await a.post('/api/schedules').send({ url: `${base}/demo/bad`, everyHours: 24 })).status).toBe(409);
  });
  it('rejects blocked targets and bad intervals', async () => {
    const a = authed(app, (await register(app)).token);
    process.env.ALLOW_PRIVATE_TARGETS = 'false';
    const blocked = await a.post('/api/schedules').send({ url: 'http://169.254.169.254/', everyHours: 6 });
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    expect(blocked.status).toBe(400);
    expect((await a.post('/api/schedules').send({ url: `${base}/demo/good`, everyHours: 0 })).status).toBe(400);
    expect((await a.post('/api/schedules').send({ url: `${base}/demo/good`, everyHours: 500 })).status).toBe(400);
  });
  it('records an error instead of crashing when a scheduled target fails', async () => {
    const { user } = await register(app);
    const s = await Schedule.create({ user: user.id, url: 'http://127.0.0.1:9/', everyHours: 1, nextRunAt: new Date(Date.now() - 1000) });
    expect(await runDueSchedules()).toBe(1);
    const after = await Schedule.findById(s._id);
    expect(after.lastError).toBeTruthy(); expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('remediation lookup by finding title', () => {
  it('resolves a title from the current audit (what small models send)', async () => {
    const u = await register(app);
    const audit = await createAudit(u.user.id, `${base}/demo/bad`, { ai: false });
    const ctx = { userId: u.user.id, auditId: String(audit._id) };
    const byTitle = await executeTool('get_remediation', { check_id: 'Content-Security-Policy' }, ctx);
    expect(byTitle.ok).toBe(true); expect(byTitle.result.check_id).toBe('sec-csp');
    expect((await executeTool('get_remediation', { check_id: 'no such finding' }, ctx)).ok).toBe(false);
  });
});
