import { describe, it, expect } from 'vitest';
import { buildCtx, runChecks } from '../src/audit/checks.js';
import { computeScores, PENALTY, WEIGHTS } from '../src/audit/score.js';
import { compareAudits } from '../src/audit/compare.js';
import { REMEDIATION } from '../src/audit/remediation.js';
import { fixture } from './helpers.js';

const goodHeaders = {
  'content-security-policy': "default-src 'self'", 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=()', 'cache-control': 'max-age=60',
  'set-cookie': ['a=1; Secure; HttpOnly; SameSite=Lax'],
};
const probe = (broken = []) => async (u) => (broken.some((b) => u.includes(b)) ? { status: 404 } : { status: 200 });
const run = async (html, headers, extra = {}) => {
  const f = await runChecks(buildCtx({ url: 'https://example.com/', html, headers, timeMs: 100, encoding: 'gzip', probe: probe(), ...extra }));
  return Object.fromEntries(f.map((x) => [x.id, x]));
};

describe('checkers on the BAD fixture', () => {
  let f;
  it('runs', async () => { f = await run(fixture('bad.html'), { server: 'Apache/2.4.41', 'x-powered-by': 'Express', 'set-cookie': ['session=1'] }, { url: 'http://example.com/', encoding: '', probe: probe(['missing']) }); expect(Object.keys(f).length).toBe(29); });
  it('flags SEO issues', () => {
    expect(f['seo-title'].severity).toBe('high');
    expect(f['seo-meta-description'].severity).toBe('medium');
    expect(f['seo-h1'].severity).toBe('medium');
    expect(f['seo-viewport'].severity).toBe('medium');
    expect(f['seo-canonical'].severity).toBe('low');
    expect(f['seo-broken-links'].evidence).toMatch(/missing-page/);
  });
  it('flags accessibility issues', () => {
    expect(f['a11y-lang'].severity).toBe('medium');
    expect(f['a11y-img-alt'].severity).toBe('high');
    expect(f['a11y-img-alt'].evidence).toMatch(/5 of 5/);
    expect(f['a11y-form-labels'].severity).toBe('high');
    expect(f['a11y-heading-order'].severity).toBe('low');
    expect(f['a11y-link-names'].severity).toBe('medium');
  });
  it('flags security issues', () => {
    for (const id of ['sec-https', 'sec-csp']) expect(f[id].severity).toBe('high');
    for (const id of ['sec-hsts', 'sec-xcto', 'sec-frame', 'sec-cookies']) expect(f[id].severity).toBe('medium');
    expect(f['sec-disclosure'].severity).toBe('low');
  });
  it('flags performance issues', () => {
    expect(f['perf-render-blocking'].severity).toBe('medium');
    expect(f['perf-render-blocking'].evidence).toMatch(/3 script/);
  });
});

describe('checkers on the GOOD fixture', () => {
  it('passes everything except HTTP (when served over http)', async () => {
    const f = await run(fixture('good.html'), goodHeaders, { url: 'http://example.com/', bytes: 3000 });
    const failing = Object.values(f).filter((x) => x.severity !== 'pass').map((x) => x.id);
    expect(failing).toEqual(['sec-https']);
  });
  it('passes everything over https', async () => {
    const f = await run(fixture('good.html'), goodHeaders);
    expect(Object.values(f).every((x) => x.severity === 'pass')).toBe(true);
  });
});

describe('individual edge cases', () => {
  it('title length', async () => {
    const f = await run('<html><head><title>Short</title></head></html>', goodHeaders);
    expect(f['seo-title'].severity).toBe('low');
  });
  it('label wrapping input counts as labelled', async () => {
    const f = await run('<label>Name <input type="text"></label><input type="hidden"><input aria-label="x">', goodHeaders);
    expect(f['a11y-form-labels'].severity).toBe('pass');
  });
  it('weak hsts', async () => {
    const f = await run('<html></html>', { ...goodHeaders, 'strict-transport-security': 'max-age=100' });
    expect(f['sec-hsts'].severity).toBe('medium');
  });
  it('csp frame-ancestors satisfies clickjacking', async () => {
    const h = { ...goodHeaders }; delete h['x-frame-options']; h['content-security-policy'] = "frame-ancestors 'none'";
    expect((await run('<html></html>', h))['sec-frame'].severity).toBe('pass');
  });
  it('slow response graded', async () => {
    const f = await run('<html></html>', goodHeaders, { timeMs: 2500 });
    expect(f['perf-response-time'].severity).toBe('medium');
  });
});

describe('scoring', () => {
  const mk = (category, severity) => ({ category, severity });
  it('uses 15/7/3 penalties', () => expect(PENALTY).toEqual({ high: 15, medium: 7, low: 3, pass: 0 }));
  it('weights sum to 1', () => expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1));
  it('all pass => 100', () => expect(computeScores([mk('seo', 'pass')]).overall).toBe(100));
  it('computes category loss', () => {
    const s = computeScores([mk('seo', 'high'), mk('seo', 'medium'), mk('seo', 'low'), mk('security', 'high')]);
    expect(s.seo).toBe(75); expect(s.security).toBe(85);
    expect(s.overall).toBe(Math.round(85 * 0.3 + 75 * 0.25 + 100 * 0.25 + 100 * 0.2));
  });
  it('floors at 0', () => expect(computeScores(Array(10).fill(mk('security', 'high'))).security).toBe(0));
});

describe('remediation map + compare', () => {
  it('has an entry for every check id', async () => {
    const f = await run(fixture('bad.html'), {});
    for (const id of Object.keys(f)) expect(REMEDIATION[id], id).toBeTruthy();
  });
  it('compare reports fixed and new issues', () => {
    const A = { _id: 'a', url: 'x', scores: { overall: 40 }, findings: [{ id: 'p', severity: 'high' }, { id: 'q', severity: 'pass' }] };
    const B = { _id: 'b', url: 'x', scores: { overall: 90 }, findings: [{ id: 'p', severity: 'pass' }, { id: 'q', severity: 'low' }] };
    const c = compareAudits(A, B);
    expect(c.deltas.overall).toBe(50);
    expect(c.fixed.map((x) => x.id)).toEqual(['p']);
    expect(c.newIssues.map((x) => x.id)).toEqual(['q']);
  });
});
