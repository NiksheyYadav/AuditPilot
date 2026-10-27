import { z } from 'zod';
import { Audit } from '../models/index.js';
import { createAudit, findOwned } from '../services/auditService.js';
import { compareAudits } from '../audit/compare.js';
import { getRemediation } from '../audit/remediation.js';
import { topFindings } from '../audit/score.js';

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}...` : String(s));
const view = (a, n = 8) => ({
  id: String(a._id), url: a.url, createdAt: a.createdAt, scores: a.scores,
  topFindings: topFindings(a.findings, n).map((f) => ({ id: f.id, severity: f.severity, title: f.title, evidence: clip(f.evidence, 160) })),
});

/**
 * Single source of truth for tools. Used by the chat agent (OpenAI tool format) AND the MCP server.
 * Every handler receives ctx.userId from the authenticated session, never from model output.
 */
export const TOOLS = [
  {
    name: 'run_audit', mcpName: 'audit_url',
    description: 'Run a NEW audit of a URL and return scores and top findings.',
    schema: z.object({ url: z.string().min(3).max(2048).describe('Website URL, http or https') }),
    handler: async (ctx, { url }) => view(await createAudit(ctx.userId, /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`, { ai: false })),
    summarize: (r) => `audit ${r.id}: overall ${r.scores.overall}/100`,
  },
  {
    name: 'get_audit', mcpName: 'get_audit',
    description: "Get one of the user's audits by id (default: the current audit).",
    schema: z.object({ audit_id: z.string().min(8).max(40).optional() }),
    handler: async (ctx, { audit_id }) => view(await findOwned(ctx.userId, audit_id || ctx.auditId)),
    summarize: (r) => `${r.url} overall ${r.scores.overall}/100, ${r.topFindings.length} top findings`,
  },
  {
    name: 'list_my_audits', mcpName: 'list_audits',
    description: "List the user's recent audits (id, url, overall score, date).",
    schema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
    handler: async (ctx, { limit = 10 }) => ({
      audits: (await Audit.find({ user: ctx.userId }).sort({ createdAt: -1 }).limit(limit).select('url scores createdAt'))
        .map((a) => ({ id: String(a._id), url: a.url, overall: a.scores.overall, createdAt: a.createdAt })),
    }),
    summarize: (r) => `${r.audits.length} audits`,
  },
  {
    name: 'compare_audits', mcpName: 'compare_audits',
    description: 'Compare two audits: score changes, fixed issues, new issues.',
    schema: z.object({ audit_id_a: z.string().min(8).max(40), audit_id_b: z.string().min(8).max(40) }),
    handler: async (ctx, { audit_id_a, audit_id_b }) => {
      const [a, b] = await Promise.all([findOwned(ctx.userId, audit_id_a), findOwned(ctx.userId, audit_id_b)]);
      const c = compareAudits(a.toObject(), b.toObject());
      const t = (l) => l.slice(0, 8).map((f) => `${f.title} (${f.severity})`);
      return { deltas: c.deltas, fixedCount: c.fixed.length, fixed: t(c.fixed), newIssueCount: c.newIssues.length, newIssues: t(c.newIssues), stillOpen: c.stillOpenCount };
    },
    summarize: (r) => `overall ${r.deltas.overall >= 0 ? '+' : ''}${r.deltas.overall}, ${r.fixedCount} fixed, ${r.newIssueCount} new`,
  },
  {
    name: 'get_remediation', mcpName: 'get_remediation',
    description: 'Get fix instructions and a code snippet for a check id (e.g. sec-csp).',
    schema: z.object({ check_id: z.string().min(3).max(40) }),
    handler: async (ctx, { check_id }) => {
      const r = getRemediation(check_id);
      if (!r) throw new Error(`Unknown check id: ${check_id}`);
      return { check_id, summary: r.summary, snippets: r.snippets.slice(0, 2).map((s) => ({ label: s.label, code: clip(s.code, 500) })) };
    },
    summarize: (r) => `fix for ${r.check_id}`,
  },
];

export const toOpenAiTools = () => TOOLS.map((t) => {
  const { $schema, ...parameters } = z.toJSONSchema(t.schema);
  return { type: 'function', function: { name: t.name, description: t.description, parameters } };
});

/** Validate + run a tool. Never throws: returns {ok, result|error, summary, ms}. */
export async function executeTool(name, rawArgs, ctx) {
  const t0 = Date.now();
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool "${name}". Available: ${TOOLS.map((x) => x.name).join(', ')}`, ms: 0 };
  let args = rawArgs;
  if (typeof rawArgs === 'string') {
    try { args = rawArgs.trim() ? JSON.parse(rawArgs) : {}; } catch { return { ok: false, error: 'Arguments are not valid JSON. Send a JSON object.', ms: 0 }; }
  }
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ');
    return { ok: false, error: `Invalid arguments for ${name} (${why})`, ms: 0, args };
  }
  try {
    const result = await tool.handler(ctx, parsed.data);
    return { ok: true, result, summary: tool.summarize(result), ms: Date.now() - t0, args: parsed.data };
  } catch (e) {
    return { ok: false, error: e.message || 'Tool failed', ms: Date.now() - t0, args: parsed.data };
  }
}
