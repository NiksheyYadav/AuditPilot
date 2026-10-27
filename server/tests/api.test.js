import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startDb, stopDb, clearDb, makeApp, register, authed, listen } from './helpers.js';
import { Audit } from '../src/models/index.js';

process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'mock';
process.env.ALLOW_PRIVATE_TARGETS = 'true';

let app, srv, base;
beforeAll(async () => { await startDb(); app = makeApp({ auditRateLimit: 100 }); ({ server: srv, base } = await listen(app)); });
afterAll(async () => { srv.close(); await stopDb(); });
beforeEach(clearDb);

describe('auth', () => {
  it('registers, logs in, returns me', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'Ann', email: 'Ann@Test.dev', password: 'password123' });
    expect(r.status).toBe(201); expect(r.body.user.email).toBe('ann@test.dev');
    expect((await request(app).post('/api/auth/login').send({ email: 'ann@test.dev', password: 'password123' })).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${r.body.token}`)).body.user.name).toBe('Ann');
  });
  it('validates and rejects', async () => {
    expect((await request(app).post('/api/auth/register').send({ name: 'A', email: 'bad', password: '1' })).status).toBe(400);
    await register(app, 'Dup', 'dup@test.dev');
    expect((await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'dup@test.dev', password: 'password123' })).status).toBe(409);
    expect((await request(app).post('/api/auth/login').send({ email: 'dup@test.dev', password: 'wrongpass1' })).status).toBe(401);
  });
  it('requires a token', async () => {
    expect((await request(app).get('/api/audits')).status).toBe(401);
    expect((await request(app).get('/api/audits').set('Authorization', 'Bearer junk')).status).toBe(401);
  });
});

describe('audits', () => {
  it('audits the bad and good demo pages with a big score jump', async () => {
    const { token } = await register(app); const a = authed(app, token);
    const bad = await a.post('/api/audits').send({ url: `${base}/demo/bad` });
    const good = await a.post('/api/audits').send({ url: `${base}/demo/good` });
    expect(bad.status).toBe(201); expect(good.status).toBe(201);
    expect(bad.body.scores.overall).toBeLessThan(60);
    expect(good.body.scores.overall).toBeGreaterThan(90);
    expect(bad.body.findings.length).toBe(29);
    expect(bad.body.findings.find((f) => f.id === 'sec-csp').fix.snippets.length).toBeGreaterThan(0);
    expect(bad.body.aiStatus).toBe('pending');
  });
  it('rejects SSRF targets and bad input with proper codes', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'false';
    const { token } = await register(app); const a = authed(app, token);
    expect((await a.post('/api/audits').send({ url: 'http://169.254.169.254/' })).status).toBe(400);
    expect((await a.post('/api/audits').send({ url: 'file:///etc/passwd' })).status).toBe(400);
    expect((await a.post('/api/audits').send({})).status).toBe(400);
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
  });
  it('lists, gets, trends, deletes and compares', async () => {
    const { token } = await register(app); const a = authed(app, token);
    const bad = (await a.post('/api/audits').send({ url: `${base}/demo/bad` })).body;
    const good = (await a.post('/api/audits').send({ url: `${base}/demo/good` })).body;
    expect((await a.get('/api/audits')).body.audits.length).toBe(2);
    expect((await a.get(`/api/audits/${bad.id}`)).status).toBe(200);
    expect((await a.get(`/api/audits/trend?url=${encodeURIComponent(bad.url)}`)).body.points.length).toBe(1);
    const cmp = await a.get(`/api/audits/compare?a=${bad.id}&b=${good.id}`);
    expect(cmp.status).toBe(200);
    expect(cmp.body.deltas.overall).toBeGreaterThan(40);
    expect(cmp.body.fixed.length).toBeGreaterThan(10);
    expect((await a.get(`/api/audits/compare?a=${bad.id}`)).status).toBe(400);
    expect((await a.delete(`/api/audits/${bad.id}`)).status).toBe(204);
    expect((await a.get(`/api/audits/${bad.id}`)).status).toBe(404);
    expect((await a.get('/api/audits/not-an-id')).status).toBe(404);
  });
  it('user A cannot read, delete or compare user B audits', async () => {
    const A = await register(app), B = await register(app);
    const mine = (await authed(app, A.token).post('/api/audits').send({ url: `${base}/demo/good` })).body;
    const b = authed(app, B.token);
    expect((await b.get(`/api/audits/${mine.id}`)).status).toBe(404);
    expect((await b.delete(`/api/audits/${mine.id}`)).status).toBe(404);
    expect((await b.get(`/api/audits/compare?a=${mine.id}&b=${mine.id}`)).status).toBe(404);
    expect((await b.get('/api/audits')).body.audits.length).toBe(0);
    expect(await Audit.countDocuments({ user: A.user.id })).toBe(1);
  });
  it('rate limits audits per user', async () => {
    const limited = makeApp({ auditRateLimit: 2 });
    const { token } = await register(limited); const a = authed(limited, token);
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await a.post('/api/audits').send({ url: `${base}/demo/good` })).status);
    expect(codes).toEqual([201, 201, 429]);
  });
  it('health reports llm mode', async () => {
    const r = await request(app).get('/api/health');
    expect(r.body.llm.mock).toBe(true); expect(r.body.llm.provider).toBe('mock');
  });
  it('unknown route is 404 json', async () => {
    const r = await request(app).get('/api/nope'); expect(r.status).toBe(404); expect(r.body.error.message).toMatch(/not found/i);
  });
});
