// Static remediation map: works without any LLM. One entry per check id.
const s = (label, lang, code) => ({ label, lang, code });

export const REMEDIATION = {
  'seo-title': { summary: 'Give every page a unique 30-60 character title.', snippets: [s('HTML', 'html', '<title>AuditPilot - AI Website Audit Agent</title>')] },
  'seo-meta-description': { summary: 'Add a 70-160 character description.', snippets: [s('HTML', 'html', '<meta name="description" content="Audit any website for SEO, accessibility, security and performance, then get a prioritised fix plan.">')] },
  'seo-h1': { summary: 'Use exactly one H1.', snippets: [s('HTML', 'html', '<h1>Main page topic</h1>\n<h2>Section heading</h2>')] },
  'seo-canonical': { summary: 'Declare the canonical URL.', snippets: [s('HTML', 'html', '<link rel="canonical" href="https://example.com/page">')] },
  'seo-open-graph': { summary: 'Add Open Graph tags for rich previews.', snippets: [s('HTML', 'html', '<meta property="og:title" content="Page title">\n<meta property="og:description" content="Short description">\n<meta property="og:image" content="https://example.com/preview.png">')] },
  'seo-viewport': { summary: 'Make the page mobile friendly.', snippets: [s('HTML', 'html', '<meta name="viewport" content="width=device-width, initial-scale=1">')] },
  'seo-robots': { summary: 'Publish robots.txt.', snippets: [s('robots.txt', 'text', 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml')] },
  'seo-sitemap': { summary: 'Publish sitemap.xml.', snippets: [s('sitemap.xml', 'xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc></url>\n</urlset>')] },
  'seo-broken-links': { summary: 'Fix or redirect broken URLs.', snippets: [s('Express redirect', 'js', "app.get('/old-page', (req, res) => res.redirect(301, '/new-page'));")] },
  'a11y-lang': { summary: 'Declare the page language.', snippets: [s('HTML', 'html', '<html lang="en">')] },
  'a11y-img-alt': { summary: 'Describe every image.', snippets: [s('HTML', 'html', '<img src="team.jpg" alt="Our team at the 2025 summit">\n<img src="divider.svg" alt="">  <!-- decorative -->')] },
  'a11y-form-labels': { summary: 'Label every form control.', snippets: [s('HTML', 'html', '<label for="email">Email</label>\n<input id="email" name="email" type="email">')] },
  'a11y-heading-order': { summary: 'Do not skip heading levels.', snippets: [s('HTML', 'html', '<h1>Title</h1>\n<h2>Section</h2>\n<h3>Sub-section</h3>')] },
  'a11y-link-names': { summary: 'Give links and buttons accessible names.', snippets: [s('HTML', 'html', '<button aria-label="Open menu"><svg aria-hidden="true">...</svg></button>')] },
  'sec-https': { summary: 'Serve everything over HTTPS.', snippets: [s('Nginx redirect', 'nginx', 'server {\n  listen 80;\n  server_name example.com;\n  return 301 https://$host$request_uri;\n}'), s('Express (behind proxy)', 'js', "app.set('trust proxy', 1);\napp.use((req, res, next) => req.secure ? next() : res.redirect(301, 'https://' + req.headers.host + req.url));")] },
  'sec-hsts': { summary: 'Tell browsers to always use HTTPS.', snippets: [s('Express (helmet)', 'js', "import helmet from 'helmet';\napp.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));"), s('Nginx', 'nginx', 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;')] },
  'sec-csp': { summary: 'Restrict where scripts, styles and images may load from.', snippets: [s('Express (helmet)', 'js', "app.use(helmet.contentSecurityPolicy({\n  directives: { defaultSrc: [\"'self'\"], scriptSrc: [\"'self'\"], imgSrc: [\"'self'\", 'data:'] }\n}));"), s('Nginx', 'nginx', "add_header Content-Security-Policy \"default-src 'self'\" always;")] },
  'sec-xcto': { summary: 'Stop MIME sniffing.', snippets: [s('Express (helmet)', 'js', 'app.use(helmet.noSniff());'), s('Nginx', 'nginx', 'add_header X-Content-Type-Options "nosniff" always;')] },
  'sec-frame': { summary: 'Prevent clickjacking.', snippets: [s('Express (helmet)', 'js', "app.use(helmet.frameguard({ action: 'deny' }));"), s('Nginx', 'nginx', 'add_header X-Frame-Options "DENY" always;')] },
  'sec-referrer': { summary: 'Limit referrer leakage.', snippets: [s('Express (helmet)', 'js', "app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));"), s('Nginx', 'nginx', 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;')] },
  'sec-permissions': { summary: 'Disable browser features you do not use.', snippets: [s('Express', 'js', "app.use((req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); next(); });"), s('Nginx', 'nginx', 'add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;')] },
  'sec-cookies': { summary: 'Harden cookies.', snippets: [s('Express', 'js', "res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax' });")] },
  'sec-disclosure': { summary: 'Hide technology details.', snippets: [s('Express', 'js', "app.disable('x-powered-by');"), s('Nginx', 'nginx', 'server_tokens off;')] },
  'perf-response-time': { summary: 'Reduce time to first byte.', snippets: [s('Express caching', 'js', "app.get('/', (req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.send(cachedHtml); });")] },
  'perf-html-size': { summary: 'Shrink the HTML payload.', snippets: [s('Tip', 'text', 'Paginate long lists, lazy-load below-the-fold sections, remove inline JSON blobs.')] },
  'perf-compression': { summary: 'Compress text responses.', snippets: [s('Express', 'js', "import compression from 'compression';\napp.use(compression());"), s('Nginx', 'nginx', 'gzip on;\ngzip_types text/html text/css application/javascript application/json;')] },
  'perf-cache-control': { summary: 'Send caching headers.', snippets: [s('Express', 'js', "app.use(express.static('public', { maxAge: '1d' }));"), s('Nginx', 'nginx', 'add_header Cache-Control "public, max-age=300";')] },
  'perf-resource-count': { summary: 'Reduce request count.', snippets: [s('Tip', 'text', 'Bundle JS/CSS with Vite or esbuild, use image sprites or SVG, lazy-load images with loading="lazy".')] },
  'perf-render-blocking': { summary: 'Defer head scripts.', snippets: [s('HTML', 'html', '<script src="/app.js" defer></script>')] },
};

export const getRemediation = (id) => REMEDIATION[id] || null;
