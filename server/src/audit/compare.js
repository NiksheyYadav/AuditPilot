const brief = (a) => ({ id: String(a._id), url: a.url, createdAt: a.createdAt, scores: a.scores });
const bad = (f) => f.severity !== 'pass';

/** Compare two audit documents: score deltas, issues fixed in B, issues new in B. */
export function compareAudits(a, b) {
  const keys = ['overall', 'seo', 'accessibility', 'security', 'performance'];
  const deltas = Object.fromEntries(keys.map((k) => [k, (b.scores?.[k] ?? 0) - (a.scores?.[k] ?? 0)]));
  const mapA = new Map(a.findings.map((f) => [f.id, f])), mapB = new Map(b.findings.map((f) => [f.id, f]));
  const fixed = a.findings.filter((f) => bad(f) && !(mapB.get(f.id) && bad(mapB.get(f.id))));
  const newIssues = b.findings.filter((f) => bad(f) && !(mapA.get(f.id) && bad(mapA.get(f.id))));
  const stillOpen = b.findings.filter((f) => bad(f) && mapA.get(f.id) && bad(mapA.get(f.id)));
  return { a: brief(a), b: brief(b), deltas, fixed, newIssues, stillOpenCount: stillOpen.length };
}
