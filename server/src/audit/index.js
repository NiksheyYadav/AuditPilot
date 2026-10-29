import { safeFetch, probe as defaultProbe } from './fetcher.js';
import { buildCtx, runChecks } from './checks.js';
import { computeScores } from './score.js';
import { assertSafeUrl } from './ssrf.js';
import { renderPage } from './render.js';
import { extractLinks, pageMeta } from './links.js';
import { cfg } from '../config.js';

export class AuditInputError extends Error {
  constructor(message) { super(message); this.name = 'AuditInputError'; this.status = 422; }
}
export class OffSiteError extends Error {
  constructor(message) { super(message); this.name = 'OffSiteError'; this.status = 422; }
}

/**
 * Fetch a URL (SSRF-guarded) and run every deterministic check. No LLM involved.
 * Options: render (headless browser), probe (shared cache during a crawl), sameOrigin (refuse redirects to other sites).
 */
export async function runAudit(rawUrl, { render = false, probe = defaultProbe, sameOrigin = null } = {}) {
  const t0 = Date.now();
  await assertSafeUrl(rawUrl);
  const res = await safeFetch(rawUrl);
  if (sameOrigin && new URL(res.finalUrl).origin !== sameOrigin) throw new OffSiteError(`redirected off-site to ${new URL(res.finalUrl).origin}`);
  const type = String(res.headers['content-type'] || '');
  if (!/html|xml/i.test(type) && res.body && !/<html|<!doctype/i.test(res.body.slice(0, 500))) throw new AuditInputError(`URL did not return an HTML page (content-type: ${type || 'unknown'})`);
  // Optional: evaluate the DOM after JavaScript ran (headers and timing still come from the plain fetch).
  const html = render ? (await renderPage(res.finalUrl)).html : res.body;
  const ctx = buildCtx({ url: res.finalUrl, html, maxLinks: cfg.maxLinks, headers: res.headers, status: res.status, timeMs: res.ttfbMs, bytes: res.bytes, wireBytes: res.wireBytes, encoding: res.encoding, probe });
  const findings = await runChecks(ctx);
  return {
    rendered: Boolean(render), finalUrl: res.finalUrl, httpStatus: res.status, findings, scores: computeScores(findings), durationMs: Date.now() - t0,
    links: extractLinks(ctx.$, res.finalUrl), meta: pageMeta(ctx.$),
  };
}
