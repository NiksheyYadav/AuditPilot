import dns from 'node:dns';
import net from 'node:net';
import { cfg } from '../config.js';

export class SsrfError extends Error {
  constructor(message) { super(message); this.name = 'SsrfError'; this.status = 400; this.code = 'SSRF_BLOCKED'; }
}

const bl = new net.BlockList();
[['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]
  .forEach(([a, p]) => bl.addSubnet(a, p, 'ipv4'));
[['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]
  .forEach(([a, p]) => bl.addSubnet(a, p, 'ipv6'));

const BLOCKED_NAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);

/** True for loopback, private, link-local, CGNAT, multicast and cloud-metadata addresses. */
export function isBlockedIp(ip) {
  ip = ip.replace(/^\[|\]$/g, '').split('%')[0];
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (dotted) return bl.check(dotted[1], 'ipv4');
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return bl.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
  }
  if (net.isIPv4(ip)) return bl.check(ip, 'ipv4');
  if (net.isIPv6(ip)) return bl.check(ip, 'ipv6');
  return true; // unparseable -> block
}

function parse(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new SsrfError('Invalid URL');
  let u;
  try { u = new URL(raw.trim()); } catch { throw new SsrfError('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SsrfError('Only http and https URLs are allowed');
  if (u.username || u.password) throw new SsrfError('URLs with credentials are not allowed');
  return u;
}

/** Validates scheme + resolves DNS; throws SsrfError if any address is not public. */
export async function assertSafeUrl(raw) {
  const u = parse(raw);
  if (cfg.allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_NAMES.has(host)) throw new SsrfError(`Blocked host: ${host}`);
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfError(`Blocked address: ${host} is private, loopback or link-local`);
    return u;
  }
  let addrs;
  try { addrs = await dns.promises.lookup(host, { all: true }); } catch { throw new SsrfError(`Could not resolve host: ${host}`); }
  const bad = addrs.find((a) => isBlockedIp(a.address));
  if (bad) throw new SsrfError(`Blocked: ${host} resolves to private address ${bad.address}`);
  return u;
}

/** dns.lookup replacement used at connect time, so DNS rebinding cannot bypass the check. */
export function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!cfg.allowPrivate) {
      const bad = addrs.find((a) => isBlockedIp(a.address));
      if (bad) return cb(new SsrfError(`Blocked: ${hostname} resolves to private address ${bad.address}`));
    }
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
