import { runAudit } from '../audit/index.js';
import { getRemediation } from '../audit/remediation.js';
import { describeLlm } from '../config.js';
import { Audit } from '../models/index.js';
import { scheduleSummary } from '../agent/summary.js';
import { AppError, isId } from '../middleware/index.js';
import { ObjectId } from 'mongodb';

/** Ownership gate: a user can only ever load their own audits (404 otherwise, no existence leak). */
export async function findOwned(userId, id) {
  let audit = null;
  if (isId(id)) audit = await Audit.findOne({ _id: id, user: userId });
  else if (typeof id === 'string' && /^[a-f0-9]{6,23}$/i.test(id)) {
    // short refs (what a small local model can copy reliably): unique prefix of the user's own audits
    const hits = await Audit.find({ user: userId, _id: { $gte: new ObjectId(id.padEnd(24, '0')), $lte: new ObjectId(id.padEnd(24, 'f')) } }).limit(2);
    if (hits.length === 1) audit = hits[0];
  }
  if (!audit) throw new AppError(404, 'Audit not found');
  return audit;
}

/** Run the deterministic audit, persist it, then generate the AI summary in the background. */
export async function createAudit(userId, url, { ai = true, render = false } = {}) {
  const result = await runAudit(url, { render });
  const audit = await Audit.create({
    user: userId, url, finalUrl: result.finalUrl, status: 'done', rendered: result.rendered, scores: result.scores, findings: result.findings,
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
  rendered: a.rendered, chatCount: (a.chat || []).length, issues: (a.findings || []).filter((f) => f.severity !== 'pass').length, seeded: a.seeded,
});
