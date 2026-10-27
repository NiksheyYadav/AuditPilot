import { runAudit } from '../audit/index.js';
import { getRemediation } from '../audit/remediation.js';
import { describeLlm } from '../config.js';
import { Audit } from '../models/index.js';
import { scheduleSummary } from '../agent/summary.js';

/** Run the deterministic audit, persist it, then generate the AI summary in the background. */
export async function createAudit(userId, url, { ai = true } = {}) {
  const result = await runAudit(url);
  const audit = await Audit.create({
    user: userId, url, finalUrl: result.finalUrl, status: 'done', scores: result.scores, findings: result.findings,
    durationMs: result.durationMs, aiStatus: ai ? 'pending' : 'skipped', llm: describeLlm(),
  });
  if (ai) scheduleSummary(audit._id);
  return audit;
}

export const decorate = (audit) => {
  const o = audit.toObject ? audit.toObject() : audit;
  o.id = String(o._id);
  delete o._id; delete o.__v;
  if (o.findings) o.findings = o.findings.map((f) => ({ ...f, fix: getRemediation(f.id) }));
  return o;
};

export const brief = (a) => ({
  id: String(a._id), url: a.url, finalUrl: a.finalUrl, scores: a.scores, aiStatus: a.aiStatus, llm: a.llm, createdAt: a.createdAt,
  issues: (a.findings || []).filter((f) => f.severity !== 'pass').length, seeded: a.seeded,
});
