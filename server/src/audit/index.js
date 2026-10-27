import { safeFetch, probe } from './fetcher.js';
import { buildCtx, runChecks } from './checks.js';
import { computeScores } from './score.js';
import { assertSafeUrl } from './ssrf.js';

export class AuditInputError extends Error {
  constructor(message) { super(message); this.name = 'AuditInputError'; this.status = 422; }
}

/** Fetch a URL (SSRF-guarded) and run every deterministic check. No LLM involved. */
export async function runAudit(rawUrl) {
  const t0 = Date.now();
  await assertSafeUrl(rawUrl);
  const res = await safeFetch(rawUrl);
  const type = String(res.headers['content-type'] || '');
  if (!/html|xml/i.test(type) && res.body && !/<html|<!doctype/i.test(res.body.slice(0, 500))) throw new AuditInputError(`URL did not return an HTML page (content-type: ${type || 'unknown'})`);
  const ctx = buildCtx({ url: res.finalUrl, html: res.body, headers: res.headers, status: res.status, timeMs: res.ttfbMs, bytes: res.bytes, wireBytes: res.wireBytes, encoding: res.encoding, probe });
  const findings = await runChecks(ctx);
  return { finalUrl: res.finalUrl, httpStatus: res.status, findings, scores: computeScores(findings), durationMs: Date.now() - t0 };
}
