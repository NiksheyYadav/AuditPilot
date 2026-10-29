import { safeFetch, makeCachedProbe } from './fetcher.js';
import { assertSafeUrl } from './ssrf.js';
import { runAudit } from './index.js';
import { normalizeLink } from './links.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Minimal robots.txt parser: the most specific group (our bot name, else *), longest rule wins, Allow wins ties. */
export function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow') && val) cur.rules.push({ allow: key === 'allow', pattern: val });
    }
  }
  const mine = groups.filter((g) => g.agents.includes('auditpilotbot'));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  const matches = (pattern, path) => {
    const anchored = pattern.endsWith('$');
    const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(escapeRe).join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
  };
  return {
    allowed(pathWithQuery) {
      let best = null;
      for (const r of rules) {
        if (!matches(r.pattern, pathWithQuery)) continue;
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
      }
      return !best || best.allow;
    },
  };
}

async function loadRobots(origin) {
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { maxBytes: 200 * 1024, timeoutMs: 6000 });
    return r.status === 200 ? parseRobots(r.body) : null;
  } catch { return null; }
}

/**
 * Polite same-origin breadth-first crawl. Every page goes through runAudit (SSRF guard, redirects re-validated,
 * off-site redirects refused). Honours robots.txt, waits between requests, and stops at maxPages / the deadline.
 * onPage(page) is awaited after each audited page so callers can persist progress.
 */
export async function crawlSite(startUrl, {
  maxPages = 10, render = false, delayMs = 300, respectRobots = true, deadlineMs = 300000,
  onProgress = () => {}, onPage = async () => {}, audit = runAudit,
} = {}) {
  const origin = (await assertSafeUrl(startUrl)).origin; // throws SsrfError for blocked targets
  const start = normalizeLink(startUrl, startUrl) || startUrl;
  const probe = makeCachedProbe();
  const robots = respectRobots ? await loadRobots(origin) : null;
  const queue = [start], seen = new Set([start]), parents = new Map(), auditedFinal = new Set();
  const pages = [], broken = [], skipped = [];
  const t0 = Date.now();
  let fetches = 0;

  while (queue.length && pages.length < maxPages && fetches < maxPages * 3) {
    if (Date.now() - t0 > deadlineMs) { skipped.push({ url: '(remaining pages)', reason: 'time limit reached' }); break; }
    const url = queue.shift();
    const u = new URL(url);
    if (robots && !robots.allowed(u.pathname + u.search)) { skipped.push({ url, reason: 'disallowed by robots.txt' }); continue; }
    if (fetches++ > 0 && delayMs) await sleep(delayMs);
    onProgress({ done: pages.length, total: Math.min(maxPages, pages.length + queue.length + 1), current: url });
    try {
      const r = await audit(url, { render, probe, sameOrigin: origin });
      if (r.httpStatus >= 400) {
        if (url === start) throw new Error(`The start page returned HTTP ${r.httpStatus}`);
        broken.push({ url, status: r.httpStatus, from: parents.get(url) || start });
        continue;
      }
      if (auditedFinal.has(r.finalUrl)) { skipped.push({ url, reason: 'duplicate of an audited page (redirect)' }); continue; }
      auditedFinal.add(r.finalUrl);
      const page = { url, ...r };
      pages.push(page);
      await onPage(page);
      for (const l of r.links) if (!seen.has(l)) { seen.add(l); queue.push(l); parents.set(l, url); }
    } catch (e) {
      if (url === start) throw e; // the start page must work, otherwise there is nothing to audit
      if (e.name === 'SsrfError' || e.name === 'OffSiteError') skipped.push({ url, reason: e.message });
      else broken.push({ url, status: 0, from: parents.get(url) || start, error: e.message });
    }
  }
  if (queue.length && pages.length >= maxPages) skipped.push({ url: `(${queue.length} more pages found)`, reason: `page limit (${maxPages}) reached` });
  onProgress({ done: pages.length, total: pages.length, current: '' });
  return { origin, pages, broken, skipped };
}
