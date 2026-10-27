import { Audit } from '../models/index.js';

/** Placeholder replaced in phase 3: marks AI as skipped so audits never wait on an LLM. */
export function scheduleSummary(auditId) {
  setImmediate(() => Audit.updateOne({ _id: auditId }, { aiStatus: 'skipped' }).catch(() => {}));
}
