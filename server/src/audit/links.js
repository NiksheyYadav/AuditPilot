const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|zip|gz|tar|rar|7z|mp4|webm|mp3|wav|woff2?|ttf|eot|docx?|xlsx?|pptx?|csv)$/i;
const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

/** Absolute, hash-free, tracking-free http(s) URL, or null when the link is not a crawlable page. */
export function normalizeLink(href, base) {
  let u;
  try { u = new URL(String(href).trim(), base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (SKIP_EXT.test(u.pathname)) return null;
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return u.href;
}

/** Unique same-origin links of a parsed page (cheerio $). */
export function extractLinks($, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const out = new Set();
  $('a[href]').each((_, e) => {
    const n = normalizeLink($(e).attr('href'), baseUrl);
    if (n && new URL(n).origin === origin && !/^(nofollow)$/i.test($(e).attr('rel') || '')) out.add(n);
  });
  return [...out];
}

/** Title, meta description and H1 count: what the cross-page checks compare between pages. */
export function pageMeta($) {
  const txt = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return { title: txt($('title').first().text()), description: txt($('meta[name="description"]').attr('content')), h1Count: $('h1').length };
}
