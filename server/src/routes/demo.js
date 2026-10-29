import { Router } from 'express';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo');
const read = (f) => fs.readFileSync(path.join(dir, f));
const bad = read('bad.html'), good = read('good.html'), goodGz = zlib.gzipSync(good);
const about = Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About Acme Coffee Roasters Today</title></head><body><h1>About us</h1><p>We roast coffee.</p></body></html>');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#7c3aed"/></svg>';

const assets = {
  'site.css': ['text/css', 'body{font-family:system-ui;margin:2rem;color:#222}img{width:40px}'],
  'theme.css': ['text/css', 'h1{color:#7c3aed}'],
  'analytics.js': ['application/javascript', 'window.__analytics=true;'],
  'widgets.js': ['application/javascript', 'window.__widgets=true;'],
  'tracker.js': ['application/javascript', 'window.__tracker=true;'],
  'logo.svg': ['image/svg+xml', svg], 'bean.svg': ['image/svg+xml', svg], 'cup.svg': ['image/svg+xml', svg], 'farm.svg': ['image/svg+xml', svg],
};

/** Built-in audit targets. Mounted before helmet on purpose: /demo/bad has no security headers. */
export const demoRouter = Router();

demoRouter.get('/demo/bad', (req, res) => {
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'X-Powered-By': 'Express/4.17.1', Server: 'Apache/2.4.41 (Ubuntu)', 'Set-Cookie': 'session=abc123; Path=/' }).send(bad);
});
demoRouter.get('/demo/good', (req, res) => {
  res.set({
    'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'public, max-age=300', 'Set-Cookie': 'visit=1; Path=/; HttpOnly; Secure; SameSite=Lax',
  }).send(goodGz);
});
// Client-side rendered page: plain HTML has no title/H1/alt; the DOM after JavaScript is fine. Used to demo "Render JavaScript".
const spa = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script>
document.title = 'Client Rendered Demo Page for AuditPilot';
var m = document.createElement('meta'); m.name = 'description'; m.content = 'This page builds its content with JavaScript, so a plain HTML audit sees almost nothing while a rendered audit sees everything.'; document.head.appendChild(m);
document.getElementById('app').innerHTML = '<main><h1>Rendered with JavaScript</h1><h2>Hello</h2><img src="/demo/assets/logo.svg" alt="Logo"></main>';
</script></body></html>`);
demoRouter.get('/demo/spa', (req, res) => res.type('html').send(spa));
demoRouter.get('/demo/about', (req, res) => res.type('html').send(about));
demoRouter.get('/demo/assets/:file', (req, res) => {
  const a = assets[req.params.file];
  if (!a) return res.status(404).type('text').send('Not found');
  res.set('Cache-Control', 'public, max-age=300').type(a[0]).send(a[1]);
});
demoRouter.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nAllow: /\nDisallow: /demo/site/private/\nSitemap: /sitemap.xml\n'));
demoRouter.get('/sitemap.xml', (req, res) => res.type('xml').send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>/demo/good</loc></url></urlset>'));
