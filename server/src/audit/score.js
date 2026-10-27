export const PENALTY = { high: 15, medium: 7, low: 3, pass: 0 };
export const WEIGHTS = { security: 0.30, seo: 0.25, accessibility: 0.25, performance: 0.20 };
export const CATEGORIES = Object.keys(WEIGHTS);
export const SEVERITY_RANK = { high: 0, medium: 1, low: 2, pass: 3 };

/** Each category starts at 100 and loses 15/7/3 per high/medium/low finding (floor 0); overall is the weighted average. */
export function computeScores(findings) {
  const scores = {};
  for (const c of CATEGORIES) {
    const loss = findings.filter((f) => f.category === c).reduce((s, f) => s + (PENALTY[f.severity] ?? 0), 0);
    scores[c] = Math.max(0, 100 - loss);
  }
  scores.overall = Math.round(CATEGORIES.reduce((s, c) => s + scores[c] * WEIGHTS[c], 0));
  return scores;
}

export const topFindings = (findings, n = 10) =>
  findings.filter((f) => f.severity !== 'pass').sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, n);
