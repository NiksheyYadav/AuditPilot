import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startDb, stopDb, clearDb, makeApp, register, authed, listen } from './helpers.js';
import { Audit, User } from '../src/models/index.js';

process.env.LLM_PROVIDER = 'mock';
process.env.ALLOW_PRIVATE_TARGETS = 'true';

let app, srv, base;
beforeAll(async () => { await startDb(); app = makeApp({ auditRateLimit: 200, chatRateLimit: 200 }); ({ server: srv, base } = await listen(app)); });
afterAll(async () => { srv.close(); await stopDb(); });
beforeEach(clearDb);

describe('stale sessions (the "Audit not found" bug)', () => {
  it('a valid token for a user that no longer exists gets 401, not a half-working session', async () => {
    const { token, user } = await register(app);
    expect((await authed(app, token).get('/api/audits')).status).toBe(200);
    await User.deleteOne({ _id: user.id }); // what a database reset does
    const r = await authed(app, token).get('/api/audits');
    expect(r.status).toBe(401); expect(r.body.error.message).toMatch(/sign in again/i);
    expect((await authed(app, token).post('/api/audits/64b64b64b64b64b64b64b64b/chat').send({ message: 'hi' })).status).toBe(401);
  });
  it('chat on an audit that does not exist is a clean 404', async () => {
    const { token } = await register(app);
    const r = await authed(app, token).post('/api/audits/64b64b64b64b64b64b64b64b/chat').send({ message: 'hi' });
    expect(r.status).toBe(404); expect(r.body.error.message).toBe('Audit not found');
  });
  it('signing up again after a reset works with the same email', async () => {
    const a = await register(app, 'Ann', 'ann@reset.dev');
    await User.deleteMany({}); await Audit.deleteMany({});
    const again = await request(app).post('/api/auth/register').send({ name: 'Ann', email: 'ann@reset.dev', password: 'password123' });
    expect(again.status).toBe(201); expect(again.body.token).not.toBe(a.token);
  });
});

describe('history: search, pagination, chat history', () => {
  const seed = async (token, n) => { const a = authed(app, token); for (let i = 0; i < n; i++) await a.post('/api/audits').send({ url: `${base}/demo/${i % 2 ? 'good' : 'bad'}` }); };
  it('lists newest first with totals, pages and search', async () => {
    const { token } = await register(app); const a = authed(app, token);
    await seed(token, 5);
    const all = (await a.get('/api/audits')).body;
    expect(all.total).toBe(5); expect(all.pages).toBe(1); expect(all.audits[0].createdAt >= all.audits[4].createdAt).toBe(true);
    const p1 = (await a.get('/api/audits?limit=2&page=1')).body, p3 = (await a.get('/api/audits?limit=2&page=3')).body;
    expect(p1.audits).toHaveLength(2); expect(p1.pages).toBe(3); expect(p3.audits).toHaveLength(1);
    const good = (await a.get('/api/audits?q=DEMO/good')).body;
    expect(good.total).toBe(2); good.audits.forEach((x) => expect(x.url).toMatch(/good/));
    expect((await a.get('/api/audits?q=' + encodeURIComponent('(.*'))).body.total).toBe(0); // regex characters are escaped
    expect((await a.get('/api/audits?limit=1000')).status).toBe(400);
  });
  it("history is private to each user", async () => {
    const A = await register(app), B = await register(app);
    await seed(A.token, 2);
    expect((await authed(app, B.token).get('/api/audits')).body.total).toBe(0);
  });
  it('chat history is saved per audit, counted in the list, and can be cleared by the owner only', async () => {
    const { token } = await register(app); const a = authed(app, token);
    const audit = (await a.post('/api/audits').send({ url: `${base}/demo/bad` })).body;
    await a.post(`/api/audits/${audit.id}/chat`).send({ message: 'What should I fix first?' }).buffer().parse((res, cb) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => cb(null, d)); });
    expect((await a.get(`/api/audits/${audit.id}`)).body.chat).toHaveLength(2);
    expect((await a.get('/api/audits')).body.audits[0].chatCount).toBe(2);
    const other = authed(app, (await register(app)).token);
    expect((await other.delete(`/api/audits/${audit.id}/chat`)).status).toBe(404);
    expect((await a.delete(`/api/audits/${audit.id}/chat`)).status).toBe(204);
    expect((await a.get(`/api/audits/${audit.id}`)).body.chat).toHaveLength(0);
  });
});

describe('email + password sign up and sign in', () => {
  it('normalises email, enforces password rules, never returns the hash, rejects wrong passwords', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'Zed', email: '  Zed@Example.COM ', password: 'longenough1' });
    expect(r.status).toBe(201); expect(r.body.user.email).toBe('zed@example.com'); expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|longenough1/);
    expect((await request(app).post('/api/auth/register').send({ name: 'Zed', email: 'zed@example.com', password: 'longenough1' })).status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ name: 'Zed', email: 'a@b.dev', password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'ZED@example.com', password: 'longenough1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'zed@example.com', password: 'wrong-pass-1' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'longenough1' })).status).toBe(401);
  });
});
