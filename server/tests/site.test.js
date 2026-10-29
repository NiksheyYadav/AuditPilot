import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { startDb, stopDb, clearDb, makeApp, register, authed, listen } from './helpers.js';
import { Audit, SiteAudit } from '../src/models/index.js';
import { parseRobots, crawlSite } from '../src/audit/crawl.js';
import { normalizeLink } from '../src/audit/links.js';
import { aggregateScores, crossPageFindings } from '../src/audit/siteChecks.js';
import { markStaleSiteAudits, startSiteAudit } from '../src/services/siteService.js';
import { SsrfError } from '../src/audit/ssrf.js';

process.env.LLM_PROVIDER = 'mock';
process.env.ALLOW_PRIVATE_TARGETS = 'true';
process.env.CRAWL_DELAY_MS = '0';

let app, srv, base;
beforeAll(async () => { await startDb(); app = makeApp({ auditRateLimit: 200, siteRateLimit: 100 }); ({ server: srv, base } = await listen(app)); });
afterAll(async () => { srv.close(); await stopDb(); });
beforeEach(clearDb);

const waitDone = async (a, id, ms = 40000) => {
  const t0 = Date.now();
  for (;;) {
    const s = (await a.get(`/api/sites/${id}`)).body;
    if (s.status !== 'running' && s.aiStatus !== 'pending') return s;
    if (Date.now() - t0 > ms) throw new Error(`site audit did not finish: ${JSON.stringify({ status: s.status, ai: s.aiStatus, progress: s.progress })}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('robots.txt parser', () => {
  const r = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/ok\nDisallow: /*.pdf$\n\nUser-agent: badbot\nDisallow: /');
  it('applies the * group, longest rule wins, Allow wins ties', () => {
    expect(r.allowed('/')).toBe(true);
    expect(r.allowed('/private/secret')).toBe(false);
    expect(r.allowed('/private/ok')).toBe(true);
    expect(r.allowed('/docs/file.pdf')).toBe(false);
    expect(r.allowed('/docs/file.pdf.html')).toBe(true);
  });
  it('prefers a group that names our bot, and an empty file allows everything', () => {
    expect(parseRobots('User-agent: auditpilotbot\nDisallow: /x\nUser-agent: *\nDisallow: /').allowed('/y')).toBe(true);
    expect(parseRobots('User-agent: auditpilotbot\nDisallow: /x').allowed('/x/1')).toBe(false);
    expect(parseRobots('').allowed('/anything')).toBe(true);
  });
});

describe('link normalisation', () => {
  it('drops hashes, tracking params, non-pages and non-http', () => {
    expect(normalizeLink('/a?utm_source=x&id=2#top', 'https://e.com/')).toBe('https://e.com/a?id=2');
    expect(normalizeLink('mailto:a@b.c', 'https://e.com/')).toBeNull();
    expect(normalizeLink('/file.pdf', 'https://e.com/')).toBeNull();
    expect(normalizeLink('javascript:void(0)', 'https://e.com/')).toBeNull();
    expect(normalizeLink('page', 'https://e.com/dir/')).toBe('https://e.com/dir/page');
  });
});

describe('cross-page checks and aggregate score', () => {
  const pg = (url, title, description, scores) => ({ url, meta: { title, description }, scores });
  it('flags duplicates and broken pages, passes when clean', () => {
    const dirty = crossPageFindings([pg('https://e.com/a', 'Same', 'D1'), pg('https://e.com/b', 'Same', 'D1'), pg('https://e.com/c', 'Other', 'D2')], [{ url: 'https://e.com/x', status: 404, from: 'https://e.com/a' }]);
    const by = Object.fromEntries(dirty.map((f) => [f.id, f]));
    expect(by['site-duplicate-titles'].severity).toBe('medium'); expect(by['site-duplicate-titles'].evidence).toMatch(/2 pages share the title "Same"/);
    expect(by['site-duplicate-descriptions'].severity).toBe('low');
    expect(by['site-broken-pages'].severity).toBe('medium');
    const clean = crossPageFindings([pg('https://e.com/a', 'A', 'x'), pg('https://e.com/b', 'B', 'y')], []);
    expect(clean.every((f) => f.severity === 'pass')).toBe(true);
    expect(crossPageFindings([], Array(3).fill({ url: 'https://e.com/x', status: 404, from: 'https://e.com/' })).find((f) => f.id === 'site-broken-pages').severity).toBe('high');
  });
  it('averages categories and subtracts cross-page penalties (15/7/3) in their category', () => {
    const pages = [{ scores: { seo: 100, accessibility: 80, security: 60, performance: 100 } }, { scores: { seo: 80, accessibility: 100, security: 60, performance: 90 } }];
    const clean = aggregateScores(pages, []);
    expect(clean).toMatchObject({ seo: 90, accessibility: 90, security: 60, performance: 95 });
    expect(clean.overall).toBe(Math.round(60 * 0.3 + 90 * 0.25 + 90 * 0.25 + 95 * 0.2));
    const withCross = aggregateScores(pages, [{ category: 'seo', severity: 'medium' }, { category: 'seo', severity: 'low' }]);
    expect(withCross.seo).toBe(80);
    expect(aggregateScores(pages, Array(20).fill({ category: 'seo', severity: 'high' })).seo).toBe(0);
  });
});

describe('crawlSite on the demo site', () => {
  const start = () => `${base}/demo/site`;
  it('discovers pages breadth-first, finds the broken link, skips robots-blocked and off-site pages', async () => {
    const r = await crawlSite(start(), { maxPages: 25, delayMs: 0 });
    const paths = r.pages.map((p) => new URL(p.url).pathname).sort();
    expect(paths).toEqual(['/demo/site', '/demo/site/about', '/demo/site/contact', '/demo/site/products', '/demo/site/products/beans', '/demo/site/products/gear', '/demo/site/team'].sort());
    expect(r.broken.map((b) => new URL(b.url).pathname)).toEqual(['/demo/site/missing']);
    expect(r.broken[0]).toMatchObject({ status: 404 });
    expect(r.skipped.some((s) => /robots/.test(s.reason) && s.url.includes('/private/secret'))).toBe(true);
    expect(r.pages.some((p) => p.url.includes('example.com'))).toBe(false);
    expect(r.pages[0].url).toBe(start()); // breadth-first: the start page comes first
  }, 60000);
  it('stops at maxPages and says so', async () => {
    const r = await crawlSite(start(), { maxPages: 3, delayMs: 0 });
    expect(r.pages).toHaveLength(3);
    expect(r.skipped.some((s) => /page limit \(3\)/.test(s.reason))).toBe(true);
  }, 60000);
  it('can ignore robots.txt only when told to', async () => {
    const r = await crawlSite(start(), { maxPages: 25, delayMs: 0, respectRobots: false });
    expect(r.pages.some((p) => p.url.includes('/private/secret'))).toBe(true);
  }, 60000);
  it('refuses blocked start URLs (SSRF guard) and fails when the start page is 404', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'false';
    await expect(crawlSite('http://169.254.169.254/', { delayMs: 0 })).rejects.toBeInstanceOf(SsrfError);
    await expect(crawlSite('file:///etc/passwd', { delayMs: 0 })).rejects.toBeInstanceOf(SsrfError);
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    await expect(crawlSite(`${base}/demo/site/nope`, { delayMs: 0 })).rejects.toThrow(/HTTP 404/);
  });
  it('never audits a page that redirects to another site', async () => {
    const other = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><head><title>Other site entirely</title></head><body><h1>x</h1></body></html>'); });
    await new Promise((r) => other.listen(0, '127.0.0.1', r));
    const home = http.createServer((req, res) => {
      if (req.url === '/r') { res.writeHead(302, { Location: `http://127.0.0.1:${other.address().port}/x` }); return res.end(); }
      res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><head><title>Home page of the first site</title></head><body><h1>Home</h1><a href="/r">go</a></body></html>');
    });
    await new Promise((r) => home.listen(0, '127.0.0.1', r));
    const r = await crawlSite(`http://127.0.0.1:${home.address().port}/`, { maxPages: 5, delayMs: 0 });
    other.close(); home.close();
    expect(r.pages).toHaveLength(1);
    expect(r.skipped.some((s) => /off-site/.test(s.reason))).toBe(true);
  }, 30000);
  it('hands one shared, memoised probe to every page of a crawl', async () => {
    const real = await import('../src/audit/fetcher.js');
    const cached = real.makeCachedProbe();
    const p1 = cached(`${base}/demo/good`, 'HEAD'), p2 = cached(`${base}/demo/good`, 'HEAD');
    expect(p1).toBe(p2); // same promise: the second call never hits the network
    expect(cached(`${base}/demo/good`, 'GET')).not.toBe(p1); // method is part of the key
    const seen = new Set();
    const audit = async (url, o) => { seen.add(o.probe); return { httpStatus: 200, finalUrl: url, findings: [], scores: { overall: 100 }, meta: {}, links: url.endsWith('/') ? [`${base}/p1`, `${base}/p2`] : [] }; };
    const r = await crawlSite(`${base}/`, { maxPages: 3, delayMs: 0, respectRobots: false, audit });
    expect(r.pages).toHaveLength(3);
    expect(seen.size).toBe(1); expect([...seen][0]).toBeTypeOf('function');
  });
});

describe('site audit API', () => {
  it('runs in the background: 202, progress, pages saved as normal audits, cross findings, aggregate score, AI summary', async () => {
    const { token, user } = await register(app); const a = authed(app, token);
    const created = await a.post('/api/sites').send({ url: `${base}/demo/site`, maxPages: 25 });
    expect(created.status).toBe(202); expect(created.body.status).toBe('running');
    const s = await waitDone(a, created.body.id);
    expect(s.status).toBe('done'); expect(s.pages).toHaveLength(7);
    const ids = Object.fromEntries(s.crossFindings.map((f) => [f.id, f.severity]));
    expect(ids).toEqual({ 'site-duplicate-titles': 'medium', 'site-duplicate-descriptions': 'low', 'site-broken-pages': 'medium' });
    expect(s.broken).toHaveLength(1); expect(s.skipped.some((x) => /robots/.test(x.reason))).toBe(true);
    const mean = (k) => s.pages.reduce((t, p) => t + p.scores[k], 0) / s.pages.length;
    expect(s.scores.seo).toBe(Math.round(Math.max(0, mean('seo') - 7 - 3 - 7)));
    expect(s.scores.security).toBe(Math.round(mean('security')));
    expect(s.aiStatus).toBe('ready'); expect(s.summary).toMatch(/MOCK LLM/); expect(s.llm.mock).toBe(true);
    // every page is a real audit that works with chat, compare and history tools
    expect(await Audit.countDocuments({ user: user.id, site: s.id })).toBe(7);
    const first = (await a.get(`/api/audits/${s.pages[0].audit}`)).body;
    expect(first.site).toBe(s.id); expect(first.aiStatus).toBe('skipped'); expect(first.findings).toHaveLength(29);
    // crawl pages stay out of the normal history unless asked for
    expect((await a.get('/api/audits')).body.total).toBe(0);
    expect((await a.get('/api/audits?includeSite=1')).body.total).toBe(7);
    expect((await a.get('/api/sites')).body.sites[0]).toMatchObject({ id: s.id, pageCount: 7, status: 'done' });
  }, 60000);

  it('validates input, guards SSRF, limits to one running crawl, and rate limits', async () => {
    const { token, user } = await register(app); const a = authed(app, token);
    expect((await a.post('/api/sites').send({ url: `${base}/demo/site`, maxPages: 0 })).status).toBe(400);
    expect((await a.post('/api/sites').send({ url: `${base}/demo/site`, maxPages: 99 })).status).toBe(400);
    expect((await a.post('/api/sites').send({})).status).toBe(400);
    process.env.ALLOW_PRIVATE_TARGETS = 'false';
    const blocked = await a.post('/api/sites').send({ url: 'http://169.254.169.254/' });
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    expect(blocked.status).toBe(400);
    await startSiteAudit(user.id, `${base}/demo/site`, { run: false }); // left in 'running'
    expect((await a.post('/api/sites').send({ url: `${base}/demo/site` })).status).toBe(409);
    const limited = makeApp({ siteRateLimit: 1 }); const b = authed(limited, (await register(limited)).token);
    const first = await b.post('/api/sites').send({ url: `${base}/demo/site`, maxPages: 1 });
    expect(first.status).toBe(202);
    expect((await b.post('/api/sites').send({ url: `${base}/demo/site`, maxPages: 1 })).status).toBe(429);
    await waitDone(b, first.body.id);
  }, 60000);

  it("is private to its owner and deleting it removes its page audits", async () => {
    const A = await register(app), B = await register(app);
    const a = authed(app, A.token), b = authed(app, B.token);
    const id = (await a.post('/api/sites').send({ url: `${base}/demo/site`, maxPages: 3 })).body.id;
    const s = await waitDone(a, id);
    expect((await b.get(`/api/sites/${id}`)).status).toBe(404);
    expect((await b.delete(`/api/sites/${id}`)).status).toBe(404);
    expect((await b.get('/api/sites')).body.sites).toHaveLength(0);
    expect((await request(app).get(`/api/sites/${id}`)).status).toBe(401);
    expect((await a.delete(`/api/sites/${id}`)).status).toBe(204);
    expect((await a.get(`/api/sites/${id}`)).status).toBe(404);
    expect(await Audit.countDocuments({ site: s.id })).toBe(0);
  }, 60000);

  it('marks a crawl that was running during a restart as failed instead of leaving it spinning', async () => {
    const { user } = await register(app);
    const site = await startSiteAudit(user.id, `${base}/demo/site`, { run: false });
    expect(await markStaleSiteAudits()).toBe(1);
    const after = await SiteAudit.findById(site._id);
    expect(after.status).toBe('failed'); expect(after.error).toMatch(/restart/i);
  });

  it('reports a failed crawl clearly when the start page is not reachable', async () => {
    const { token } = await register(app); const a = authed(app, token);
    const id = (await a.post('/api/sites').send({ url: `${base}/demo/site/does-not-exist` })).body.id;
    const s = await waitDone(a, id);
    expect(s.status).toBe('failed'); expect(s.error).toMatch(/404/);
  }, 30000);
});
