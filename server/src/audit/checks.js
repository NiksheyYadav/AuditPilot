import * as cheerio from 'cheerio';

const F = (id, category, severity, title, evidence, recommendation = 'No action needed.') =>
  ({ id, category, severity, title, evidence, recommendation });

/** Build the context object every checker receives. `probe(url, method)` -> {status}|null. */
export function buildCtx({ url, html, headers = {}, status = 200, timeMs = 0, bytes, wireBytes, encoding = '', probe, maxLinks = 50 }) {
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  const size = bytes ?? Buffer.byteLength(html || '');
  return { url, html: html || '', $: cheerio.load(html || ''), headers: h, status, timeMs, bytes: size, wireBytes: wireBytes ?? size, encoding, maxLinks, probe: probe || (async () => null) };
}

const hdr = (ctx, n) => { const v = ctx.headers[n]; return Array.isArray(v) ? v.join(', ') : v; };
const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();

/* ---------------- SEO ---------------- */
function seoTitle({ $ }) {
  const t = txt($('title').first().text());
  if (!t) return F('seo-title', 'seo', 'high', 'Page title', 'No <title> element found.', 'Add a unique, descriptive <title> of 30-60 characters.');
  if (t.length < 30 || t.length > 60) return F('seo-title', 'seo', 'low', 'Page title', `Title is ${t.length} characters ("${t}"); recommended 30-60.`, 'Rewrite the title to 30-60 characters.');
  return F('seo-title', 'seo', 'pass', 'Page title', `"${t}" (${t.length} chars)`);
}
function seoDescription({ $ }) {
  const d = txt($('meta[name="description"]').attr('content'));
  if (!d) return F('seo-meta-description', 'seo', 'medium', 'Meta description', 'No meta description found.', 'Add <meta name="description"> of 70-160 characters.');
  if (d.length < 70 || d.length > 160) return F('seo-meta-description', 'seo', 'low', 'Meta description', `Description is ${d.length} characters; recommended 70-160.`, 'Adjust description length to 70-160 characters.');
  return F('seo-meta-description', 'seo', 'pass', 'Meta description', `${d.length} characters`);
}
function seoH1({ $ }) {
  const n = $('h1').length;
  if (n === 0) return F('seo-h1', 'seo', 'high', 'Single H1 heading', 'No <h1> found.', 'Add exactly one <h1> describing the page.');
  if (n > 1) return F('seo-h1', 'seo', 'medium', 'Single H1 heading', `${n} <h1> elements found: ${$('h1').map((_, e) => `"${txt($(e).text()).slice(0, 40)}"`).get().join(', ')}.`, 'Keep exactly one <h1>; demote the rest to <h2>.');
  return F('seo-h1', 'seo', 'pass', 'Single H1 heading', `"${txt($('h1').text()).slice(0, 80)}"`);
}
function seoCanonical({ $ }) {
  const c = $('link[rel="canonical"]').attr('href');
  return c ? F('seo-canonical', 'seo', 'pass', 'Canonical link', c)
    : F('seo-canonical', 'seo', 'low', 'Canonical link', 'No <link rel="canonical"> found.', 'Add a canonical link to avoid duplicate-content issues.');
}
function seoOg({ $ }) {
  const need = ['og:title', 'og:description', 'og:image'];
  const missing = need.filter((p) => !$(`meta[property="${p}"]`).attr('content'));
  return missing.length
    ? F('seo-open-graph', 'seo', 'low', 'Open Graph tags', `Missing: ${missing.join(', ')}.`, 'Add Open Graph tags so links preview well when shared.')
    : F('seo-open-graph', 'seo', 'pass', 'Open Graph tags', 'og:title, og:description and og:image present.');
}
function seoViewport({ $ }) {
  const v = $('meta[name="viewport"]').attr('content');
  return v ? F('seo-viewport', 'seo', 'pass', 'Viewport meta', v)
    : F('seo-viewport', 'seo', 'medium', 'Viewport meta', 'No viewport meta tag; page is not mobile-friendly.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
}
async function seoRobots(ctx) {
  const r = await ctx.probe(new URL('/robots.txt', ctx.url).href, 'GET');
  return r && r.status === 200 ? F('seo-robots', 'seo', 'pass', 'robots.txt', 'robots.txt found (HTTP 200).')
    : F('seo-robots', 'seo', 'low', 'robots.txt', r ? `robots.txt returned HTTP ${r.status}.` : 'robots.txt could not be fetched.', 'Publish a robots.txt at the site root.');
}
async function seoSitemap(ctx) {
  const r = await ctx.probe(new URL('/sitemap.xml', ctx.url).href, 'GET');
  return r && r.status === 200 ? F('seo-sitemap', 'seo', 'pass', 'sitemap.xml', 'sitemap.xml found (HTTP 200).')
    : F('seo-sitemap', 'seo', 'low', 'sitemap.xml', r ? `sitemap.xml returned HTTP ${r.status}.` : 'sitemap.xml could not be fetched.', 'Publish /sitemap.xml and reference it in robots.txt.');
}
async function seoBrokenLinks(ctx) {
  const origin = new URL(ctx.url).origin;
  const set = new Set();
  ctx.$('a[href]').each((_, e) => {
    try {
      const u = new URL(ctx.$(e).attr('href'), ctx.url);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin === origin) { u.hash = ''; set.add(u.href); }
    } catch { /* ignore */ }
  });
  const links = [...set].slice(0, ctx.maxLinks);
  const of = set.size > links.length ? ` (of ${set.size} found)` : '';
  if (!links.length) return F('seo-broken-links', 'seo', 'pass', 'Broken links', 'No same-origin links to check.');
  const broken = [];
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (i < links.length) {
      const l = links[i++];
      const r = await ctx.probe(l, 'HEAD');
      if (!r || (r.status >= 400 && r.status !== 405 && r.status !== 501)) broken.push(`${new URL(l).pathname} (${r ? r.status : 'error'})`);
    }
  }));
  if (!broken.length) return F('seo-broken-links', 'seo', 'pass', 'Broken links', `${links.length} same-origin links checked${of}, none broken.`);
  return F('seo-broken-links', 'seo', broken.length >= 3 ? 'high' : 'medium', 'Broken links', `${broken.length} of ${links.length} links${of} broken: ${broken.join(', ')}.`, 'Fix or remove the broken links.');
}

/* ---------------- Accessibility ---------------- */
function a11yLang({ $ }) {
  const l = $('html').attr('lang');
  return l ? F('a11y-lang', 'accessibility', 'pass', 'Document language', `lang="${l}"`)
    : F('a11y-lang', 'accessibility', 'medium', 'Document language', '<html> has no lang attribute.', 'Add lang="en" (or the correct code) to <html>.');
}
function a11yImgAlt({ $ }) {
  const imgs = $('img').toArray();
  const miss = imgs.filter((e) => $(e).attr('alt') === undefined);
  if (!miss.length) return F('a11y-img-alt', 'accessibility', 'pass', 'Image alt text', `${imgs.length} images, all have alt attributes.`);
  return F('a11y-img-alt', 'accessibility', miss.length >= 3 ? 'high' : 'medium', 'Image alt text', `${miss.length} of ${imgs.length} images missing alt: ${miss.slice(0, 3).map((e) => $(e).attr('src') || '(no src)').join(', ')}${miss.length > 3 ? ', ...' : ''}.`, 'Add descriptive alt text (or alt="" for decorative images).');
}
function a11yFormLabels({ $ }) {
  const inputs = $('input, select, textarea').filter((_, e) => !['hidden', 'submit', 'button', 'reset', 'image'].includes(($(e).attr('type') || '').toLowerCase())).toArray();
  const bad = inputs.filter((e) => {
    const el = $(e), id = el.attr('id');
    if (el.attr('aria-label') || el.attr('aria-labelledby') || el.attr('title')) return false;
    if (id && $(`label[for="${id}"]`).length) return false;
    return el.closest('label').length === 0;
  });
  if (!bad.length) return F('a11y-form-labels', 'accessibility', 'pass', 'Form labels', `${inputs.length} form controls, all labelled.`);
  return F('a11y-form-labels', 'accessibility', bad.length >= 3 ? 'high' : 'medium', 'Form labels', `${bad.length} of ${inputs.length} form controls have no label: ${bad.slice(0, 3).map((e) => `<${e.tagName} name="${$(e).attr('name') || ''}">`).join(', ')}.`, 'Associate each control with a <label for> or add aria-label.');
}
function a11yHeadingOrder({ $ }) {
  const levels = $('h1,h2,h3,h4,h5,h6').map((_, e) => Number(e.tagName[1])).get();
  const skips = [];
  levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) skips.push(`h${levels[i - 1]}->h${l}`); });
  return skips.length ? F('a11y-heading-order', 'accessibility', 'low', 'Heading order', `Skipped heading levels: ${skips.join(', ')}.`, 'Use headings in order without skipping levels.')
    : F('a11y-heading-order', 'accessibility', 'pass', 'Heading order', `${levels.length} headings, no skipped levels.`);
}
function a11yNames({ $ }) {
  const els = $('a[href], button, [role="button"]').toArray();
  const bad = els.filter((e) => {
    const el = $(e);
    if (txt(el.text()) || el.attr('aria-label') || el.attr('aria-labelledby') || el.attr('title')) return false;
    return !el.find('img[alt]:not([alt=""])').length;
  });
  return bad.length ? F('a11y-link-names', 'accessibility', 'medium', 'Accessible names for links and buttons', `${bad.length} links/buttons have no accessible name (e.g. ${bad.slice(0, 2).map((e) => `<${e.tagName} href="${$(e).attr('href') || ''}">`).join(', ')}).`, 'Add visible text or aria-label to every link and button.')
    : F('a11y-link-names', 'accessibility', 'pass', 'Accessible names for links and buttons', `${els.length} links/buttons, all named.`);
}

/* ---------------- Security ---------------- */
function secHttps(ctx) {
  return ctx.url.startsWith('https://') ? F('sec-https', 'security', 'pass', 'HTTPS', 'Page served over HTTPS.')
    : F('sec-https', 'security', 'high', 'HTTPS', 'Page is served over plain HTTP.', 'Serve the site over HTTPS and redirect HTTP to HTTPS.');
}
function secHsts(ctx) {
  const v = hdr(ctx, 'strict-transport-security');
  const age = v && Number((/max-age=(\d+)/i.exec(v) || [])[1] || 0);
  if (v && age >= 15552000) return F('sec-hsts', 'security', 'pass', 'Strict-Transport-Security', v);
  return F('sec-hsts', 'security', 'medium', 'Strict-Transport-Security', v ? `HSTS max-age too short (${age}s).` : 'Header missing.', 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains.');
}
function simpleHeader(id, title, name, sev, rec, ok = () => true) {
  return (ctx) => {
    const v = hdr(ctx, name);
    return v && ok(v) ? F(id, 'security', 'pass', title, `${name}: ${v}`) : F(id, 'security', sev, title, v ? `${name}: ${v} (weak value).` : `${name} header missing.`, rec);
  };
}
const secCsp = simpleHeader('sec-csp', 'Content-Security-Policy', 'content-security-policy', 'high', "Send a Content-Security-Policy such as default-src 'self'.");
const secXcto = simpleHeader('sec-xcto', 'X-Content-Type-Options', 'x-content-type-options', 'medium', 'Send X-Content-Type-Options: nosniff.', (v) => /nosniff/i.test(v));
const secReferrer = simpleHeader('sec-referrer', 'Referrer-Policy', 'referrer-policy', 'low', 'Send Referrer-Policy: strict-origin-when-cross-origin.');
const secPermissions = simpleHeader('sec-permissions', 'Permissions-Policy', 'permissions-policy', 'low', 'Send a Permissions-Policy that disables unused features.');
function secFrame(ctx) {
  const xfo = hdr(ctx, 'x-frame-options'), csp = hdr(ctx, 'content-security-policy') || '';
  if (xfo || /frame-ancestors/i.test(csp)) return F('sec-frame', 'security', 'pass', 'Clickjacking protection', xfo ? `X-Frame-Options: ${xfo}` : 'CSP frame-ancestors present.');
  return F('sec-frame', 'security', 'medium', 'Clickjacking protection', 'Neither X-Frame-Options nor CSP frame-ancestors is set.', "Send X-Frame-Options: DENY or CSP frame-ancestors 'none'.");
}
function secCookies(ctx) {
  const raw = ctx.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!cookies.length) return F('sec-cookies', 'security', 'pass', 'Cookie flags', 'No cookies set by this response.');
  const probs = [];
  for (const c of cookies) {
    const miss = [];
    if (!/;\s*secure/i.test(c)) miss.push('Secure');
    if (!/;\s*httponly/i.test(c)) miss.push('HttpOnly');
    if (!/;\s*samesite=/i.test(c)) miss.push('SameSite');
    if (miss.length) probs.push(`${c.split('=')[0]} missing ${miss.join('/')}`);
  }
  return probs.length ? F('sec-cookies', 'security', 'medium', 'Cookie flags', `${probs.join('; ')}.`, 'Set Secure, HttpOnly and SameSite on every cookie.')
    : F('sec-cookies', 'security', 'pass', 'Cookie flags', `${cookies.length} cookie(s) with Secure, HttpOnly and SameSite.`);
}
function secDisclosure(ctx) {
  const server = hdr(ctx, 'server'), pb = hdr(ctx, 'x-powered-by');
  const leaks = [];
  if (pb) leaks.push(`X-Powered-By: ${pb}`);
  if (server && /\d+\.\d+|\/\d/.test(server)) leaks.push(`Server: ${server}`);
  return leaks.length ? F('sec-disclosure', 'security', 'low', 'Technology disclosure', `Reveals: ${leaks.join('; ')}.`, 'Remove X-Powered-By and hide server version numbers.')
    : F('sec-disclosure', 'security', 'pass', 'Technology disclosure', 'No version information disclosed in headers.');
}

/* ---------------- Performance ---------------- */
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
function perfResponse(ctx) {
  const t = ctx.timeMs;
  const sev = t < 800 ? 'pass' : t < 1800 ? 'low' : t < 3000 ? 'medium' : 'high';
  return F('perf-response-time', 'performance', sev, 'Server response time', `Time to first byte: ${t} ms.`, sev === 'pass' ? undefined : 'Reduce server response time with caching, a CDN or faster backend queries.');
}
function perfSize(ctx) {
  const b = ctx.bytes;
  const sev = b < 100 * 1024 ? 'pass' : b < 500 * 1024 ? 'low' : b < 1024 * 1024 ? 'medium' : 'high';
  return F('perf-html-size', 'performance', sev, 'HTML size', `HTML document is ${kb(b)}.`, sev === 'pass' ? undefined : 'Reduce HTML size: paginate, lazy-load and remove inline bloat.');
}
function perfCompression(ctx) {
  if (/gzip|br|deflate|zstd/i.test(ctx.encoding)) return F('perf-compression', 'performance', 'pass', 'Text compression', `Content-Encoding: ${ctx.encoding} (${kb(ctx.wireBytes)} on the wire for ${kb(ctx.bytes)}).`);
  if (ctx.bytes < 1400) return F('perf-compression', 'performance', 'pass', 'Text compression', 'Response too small to benefit from compression.');
  return F('perf-compression', 'performance', 'medium', 'Text compression', `Response (${kb(ctx.bytes)}) is not compressed.`, 'Enable gzip or Brotli compression.');
}
function perfCache(ctx) {
  const v = hdr(ctx, 'cache-control');
  return v ? F('perf-cache-control', 'performance', 'pass', 'Cache-Control', v)
    : F('perf-cache-control', 'performance', 'low', 'Cache-Control', 'No Cache-Control header.', 'Send Cache-Control (e.g. public, max-age=300) for cacheable pages.');
}
function perfResources({ $ }) {
  const scripts = $('script[src]').length, styles = $('link[rel="stylesheet"]').length + $('style').length, images = $('img').length;
  const total = scripts + styles + images;
  const sev = scripts > 15 || total > 60 ? 'medium' : scripts > 8 || total > 40 ? 'low' : 'pass';
  return F('perf-resource-count', 'performance', sev, 'Resource count', `${scripts} scripts, ${styles} stylesheets, ${images} images (${total} total).`, sev === 'pass' ? undefined : 'Bundle and defer resources to reduce request count.');
}
function perfBlocking({ $ }) {
  const b = $('head script[src]').filter((_, e) => { const el = $(e); return el.attr('defer') === undefined && el.attr('async') === undefined && (el.attr('type') || '').toLowerCase() !== 'module'; });
  return b.length ? F('perf-render-blocking', 'performance', 'medium', 'Render-blocking scripts', `${b.length} script(s) in <head> without defer/async: ${b.map((_, e) => $(e).attr('src')).get().slice(0, 3).join(', ')}.`, 'Add defer (or async) to head scripts, or move them to the end of <body>.')
    : F('perf-render-blocking', 'performance', 'pass', 'Render-blocking scripts', 'No render-blocking scripts in <head>.');
}

export async function runChecks(ctx) {
  const sync = [seoTitle, seoDescription, seoH1, seoCanonical, seoOg, seoViewport, a11yLang, a11yImgAlt, a11yFormLabels, a11yHeadingOrder, a11yNames,
    secHttps, secHsts, secCsp, secXcto, secFrame, secReferrer, secPermissions, secCookies, secDisclosure,
    perfResponse, perfSize, perfCompression, perfCache, perfResources, perfBlocking];
  const [robots, sitemap, links] = await Promise.all([seoRobots(ctx), seoSitemap(ctx), seoBrokenLinks(ctx)]);
  const out = sync.map((fn) => fn(ctx));
  out.splice(6, 0, robots, sitemap, links); // keep SEO checks grouped together
  return out;
}
