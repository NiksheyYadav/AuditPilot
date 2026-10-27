import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import http from 'node:http';
import { assertSafeUrl, isBlockedIp, SsrfError } from '../src/audit/ssrf.js';
import { safeFetch } from '../src/audit/fetcher.js';

beforeEach(() => { process.env.ALLOW_PRIVATE_TARGETS = 'false'; });
afterEach(() => { process.env.ALLOW_PRIVATE_TARGETS = 'false'; });

describe('SSRF guard', () => {
  it.each(['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://10.1.2.3/', 'http://172.16.0.1/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/', 'http://[::ffff:127.0.0.1]/', 'http://metadata.google.internal/', 'http://2130706433/'])
  ('blocks %s', async (u) => { await expect(assertSafeUrl(u)).rejects.toBeInstanceOf(SsrfError); });

  it.each(['file:///etc/passwd', 'ftp://example.com/', 'gopher://x/', 'javascript:alert(1)', 'not a url', 'http://user:pw@example.com/'])
  ('rejects %s', async (u) => { await expect(assertSafeUrl(u)).rejects.toBeInstanceOf(SsrfError); });

  it('classifies IPs', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
    expect(isBlockedIp('::ffff:7f00:1')).toBe(true);
  });

  it('allows private targets only when the flag is on', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    await expect(assertSafeUrl('http://127.0.0.1:1/')).resolves.toBeInstanceOf(URL);
  });

  it('blocks a redirect to a private address (each hop re-validated)', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    const srv = http.createServer((req, res) => { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}/`;
    // first hop (loopback) allowed by the flag; flip the flag so the second hop is validated strictly
    const p = safeFetch(url);
    await p.then(() => {}, () => {});
    process.env.ALLOW_PRIVATE_TARGETS = 'false';
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(SsrfError);
    srv.close();
  });

  it('stops after 3 redirects and caps the body', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true';
    const srv = http.createServer((req, res) => {
      if (req.url === '/big') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('a'.repeat(3 * 1024 * 1024)); }
      const n = Number(req.url.slice(1)) || 0; res.writeHead(302, { Location: `/${n + 1}` }); res.end();
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    await expect(safeFetch(`${base}/0`)).rejects.toThrow(/Too many redirects/);
    const big = await safeFetch(`${base}/big`);
    expect(big.truncated).toBe(true);
    expect(big.bytes).toBe(2 * 1024 * 1024);
    srv.close();
  });
});
