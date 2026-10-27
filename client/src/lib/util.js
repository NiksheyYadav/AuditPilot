export const CATS = [
  { key: 'seo', label: 'SEO' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'security', label: 'Security' },
  { key: 'performance', label: 'Performance' },
];
export const SEV_ORDER = { high: 0, medium: 1, low: 2, pass: 3 };
export const scoreColor = (s) => (s >= 80 ? 'var(--good)' : s >= 50 ? 'var(--warn)' : 'var(--bad)');
export const fmtDate = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const host = (u) => { try { const x = new URL(u); return x.host + (x.pathname === '/' ? '' : x.pathname); } catch { return u; } };

export function toMarkdown(a) {
  const lines = [`# AuditPilot report: ${a.url}`, '', `- Date: ${new Date(a.createdAt).toISOString()}`, `- Overall score: **${a.scores.overall}/100**`,
    ...CATS.map((c) => `- ${c.label}: ${a.scores[c.key]}/100`), ''];
  if (a.summary) lines.push('## Summary', '', a.seeded ? '_Seeded sample text._ ' + a.summary : a.summary, '');
  if (a.fixPlan) lines.push('## Fix plan', '', a.fixPlan, '');
  lines.push('## Findings', '');
  [...a.findings].sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity]).forEach((f) => {
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title} (${f.category})`, '', `- Evidence: ${f.evidence}`);
    if (f.severity !== 'pass') lines.push(`- Recommendation: ${f.recommendation}`);
    (f.fix?.snippets || []).forEach((s) => lines.push('', `${s.label}:`, '```' + s.lang, s.code, '```'));
    lines.push('');
  });
  return lines.join('\n');
}

export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click(); URL.revokeObjectURL(url);
}
