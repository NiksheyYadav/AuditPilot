import { PENALTY, WEIGHTS, CATEGORIES } from './score.js';

const F = (id, severity, title, evidence, recommendation = 'No action needed.') => ({ id, category: 'seo', severity, title, evidence, recommendation });
const path = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

/** Checks that only make sense across pages: duplicate titles/descriptions and broken internal pages. */
export function crossPageFindings(pages, broken = []) {
  const dupes = (key) => {
    const m = new Map();
    for (const p of pages) { const v = (p.meta?.[key] || '').toLowerCase(); if (v) (m.get(v) || m.set(v, []).get(v)).push(p); }
    return [...m.values()].filter((g) => g.length > 1);
  };
  const out = [];
  const t = dupes('title');
  out.push(t.length
    ? F('site-duplicate-titles', 'medium', 'Duplicate page titles', t.map((g) => `${g.length} pages share the title "${g[0].meta.title.slice(0, 60)}": ${g.slice(0, 4).map((p) => path(p.url)).join(', ')}`).join('; ') + '.', 'Give every page its own descriptive title.')
    : F('site-duplicate-titles', 'pass', 'Duplicate page titles', `All ${pages.length} audited page titles are unique.`));
  const d = dupes('description');
  out.push(d.length
    ? F('site-duplicate-descriptions', 'low', 'Duplicate meta descriptions', d.map((g) => `${g.length} pages share one description: ${g.slice(0, 4).map((p) => path(p.url)).join(', ')}`).join('; ') + '.', 'Write a unique meta description for each page.')
    : F('site-duplicate-descriptions', 'pass', 'Duplicate meta descriptions', 'No two pages share the same meta description.'));
  out.push(broken.length
    ? F('site-broken-pages', broken.length >= 3 ? 'high' : 'medium', 'Broken internal pages', `${broken.length} internal link${broken.length > 1 ? 's' : ''} did not load: ${broken.slice(0, 5).map((b) => `${path(b.url)} (${b.status || 'error'}, linked from ${path(b.from)})`).join(', ')}.`, 'Fix or remove the links that point to missing pages.')
    : F('site-broken-pages', 'pass', 'Broken internal pages', 'Every internal page reached by the crawl loaded successfully.'));
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Site score = the page scoring rules applied to the whole site: each category is the average over the audited pages,
 * cross-page findings then cost 15/7/3 points in their category (floor 0), overall is the same weighted average.
 */
export function aggregateScores(pages, cross = []) {
  const cats = {};
  for (const c of CATEGORIES) cats[c] = mean(pages.map((p) => p.scores[c]));
  for (const f of cross) if (cats[f.category] !== undefined) cats[f.category] = Math.max(0, cats[f.category] - (PENALTY[f.severity] ?? 0));
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, Math.round(cats[c])]));
  scores.overall = Math.round(CATEGORIES.reduce((s, c) => s + cats[c] * WEIGHTS[c], 0));
  return scores;
}
