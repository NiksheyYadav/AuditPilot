import { Schedule } from '../models/index.js';
import { createAudit } from './auditService.js';

/** Runs every schedule whose nextRunAt has passed (sequentially, so audits and the LLM queue are never flooded). */
export async function runDueSchedules(now = new Date()) {
  const due = await Schedule.find({ enabled: true, nextRunAt: { $lte: now } }).sort({ nextRunAt: 1 }).limit(5);
  for (const s of due) {
    try {
      const audit = await createAudit(s.user, s.url, { ai: true, render: s.render });
      s.lastAuditId = audit._id; s.lastError = undefined;
    } catch (e) { s.lastError = String(e.message).slice(0, 200); }
    s.lastRunAt = new Date();
    s.nextRunAt = new Date(Date.now() + s.everyHours * 3600_000);
    await s.save();
  }
  return due.length;
}

export function startScheduler(intervalMs = 60_000) {
  const t = setInterval(() => runDueSchedules().catch((e) => console.error('[scheduler]', e.message)), intervalMs);
  t.unref();
  return t;
}
