import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { assertSafeUrl, safeLookup } from './ssrf.js';

export class FetchError extends Error {
  constructor(message) { super(message); this.name = 'FetchError'; this.status = 422; this.code = 'FETCH_FAILED'; }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function decoder(enc) {
  if (enc === 'gzip' || enc === 'x-gzip') return zlib.createGunzip();
  if (enc === 'deflate') return zlib.createInflate();
  if (enc === 'br') return zlib.createBrotliDecompress();
  return null;
}

function requestOnce(u, { method, maxBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const t0 = performance.now();
    const req = lib.request(u, {
      method, lookup: safeLookup, agent: false, signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'AuditPilotBot/1.0', 'accept': 'text/html,*/*;q=0.8', 'accept-encoding': 'gzip, deflate, br' },
    }, (res) => {
      const ttfbMs = Math.round(performance.now() - t0);
      const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
      const out = { status: res.statusCode, headers: res.headers, encoding, ttfbMs };
      if (method === 'HEAD' || REDIRECTS.has(res.statusCode)) {
        res.resume();
        return resolve({ ...out, body: '', bytes: 0, wireBytes: 0, truncated: false, totalMs: ttfbMs });
      }
      let wireBytes = 0, bytes = 0, truncated = false;
      const chunks = [];
      const finish = () => resolve({ ...out, body: Buffer.concat(chunks).toString('utf8'), bytes, wireBytes, truncated, totalMs: Math.round(performance.now() - t0) });
      const dec = decoder(encoding);
      const sink = dec || res;
      res.on('data', (c) => { wireBytes += c.length; });
      sink.on('data', (c) => {
        if (truncated) return;
        bytes += c.length;
        if (bytes > maxBytes) { truncated = true; chunks.push(c.subarray(0, c.length - (bytes - maxBytes))); bytes = maxBytes; res.destroy(); finish(); return; }
        chunks.push(c);
      });
      sink.on('end', () => { if (!truncated) finish(); });
      sink.on('error', () => { if (!truncated) finish(); });
      res.on('error', () => { if (!truncated) finish(); });
      if (dec) res.pipe(dec);
    });
    req.on('error', (e) => reject(e));
    req.end();
  });
}

/** SSRF-safe fetch: validates every hop, max 3 redirects, 10 s timeout, 2 MB body cap. */
export async function safeFetch(raw, { method = 'GET', maxBytes = 2 * 1024 * 1024, timeoutMs = 10000, maxRedirects = 3 } = {}) {
  const start = performance.now();
  let target = raw, redirects = 0;
  for (;;) {
    const u = await assertSafeUrl(target);
    let res;
    try { res = await requestOnce(u, { method, maxBytes, timeoutMs }); }
    catch (e) {
      if (e.name === 'SsrfError') throw e;
      if (e.cause?.name === 'SsrfError') throw e.cause;
      const msg = e.name === 'TimeoutError' || e.name === 'AbortError' ? `Request timed out after ${timeoutMs / 1000}s` : `Could not fetch URL (${e.code || e.message})`;
      throw new FetchError(msg);
    }
    if (REDIRECTS.has(res.status) && res.headers.location) {
      if (redirects >= maxRedirects) throw new FetchError(`Too many redirects (max ${maxRedirects})`);
      redirects++;
      target = new URL(res.headers.location, u).href;
      continue;
    }
    return { ...res, finalUrl: u.href, redirects, totalMs: Math.round(performance.now() - start) };
  }
}

/** Lightweight status probe used for robots.txt, sitemap.xml and link checks. */
export async function probe(url, method = 'GET') {
  try { const r = await safeFetch(url, { method, maxBytes: 64 * 1024, timeoutMs: 6000, maxRedirects: 3 }); return { status: r.status }; }
  catch { return null; }
}
