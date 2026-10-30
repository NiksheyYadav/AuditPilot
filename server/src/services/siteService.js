import { Audit, SiteAudit } from '../models/index.js';
import { AppError, isId } from '../middleware/index.js';
import { assertSafeUrl } from '../audit/ssrf.js';
import { crawlSite } from '../audit/crawl.js';
import { crossPageFindings, aggregateScores } from '../audit/siteChecks.js';
import { createAudit } from './auditService.js';
import { scheduleSiteSummary } from '../agent/summary.js';
import { cfg, describeLlm } from '../config.js';

/** Ownership gate for site audits (404 for other users, no existence leak). */
export async function findOwnedSite(userId, id) {
  const site = isId(id) ? await SiteAudit.findOne({ _id: id, user: userId }) : null;
  if (!site) throw new AppError(404, 'Site audit not found');
  return site;
}

/** Validates the start URL (SSRF guard), creates the record and runs the crawl in the background. */
export async function startSiteAudit(userId, rawUrl, { maxPages = 10, render = false, run = true } = {}) {
  const url = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const origin = (await assertSafeUrl(url)).origin;
  if (await SiteAudit.exists({ user: userId, status: 'running' })) throw new AppError(409, 'A site audit is already running. Wait for it to finish first.');
  const site = await SiteAudit.create({ user: userId, url, origin, maxPages: Math.min(maxPages, cfg.crawlMaxPages), rendered: render, status: 'running', aiStatus: 'skipped' });
  if (run) setImmediate(() => runSiteAudit(site._id).catch((e) => console.error('[site audit]', e.message)));
  return site;
}

/** The crawl job: every page becomes a normal audit (no per-page LLM), then cross-page checks, scores and one AI summary. */
export async function runSiteAudit(siteId, { audit } = {}) {
  const site = await SiteAudit.findById(siteId);
  if (!site) return;
  const t0 = Date.now();
  try {
    const crawl = await crawlSite(site.url, {
      maxPages: site.maxPages, render: site.rendered, delayMs: cfg.crawlDelayMs, respectRobots: cfg.crawlRespectRobots, useSitemap: cfg.crawlUseSitemap, deadlineMs: cfg.crawlTimeoutMs, audit,
      onProgress: (p) => SiteAudit.updateOne({ _id: siteId }, { progress: p }).catch(() => {}),
      onPage: async (page) => {
        const a = await createAudit(site.user, page.url, { ai: false, result: page, site: site._id });
        await SiteAudit.updateOne({ _id: siteId }, { $push: { pages: {
          url: page.finalUrl, audit: a._id, title: page.meta.title, description: page.meta.description,
          scores: page.scores, issues: page.findings.filter((f) => f.severity !== 'pass').length,
        } } });
      },
    });
    const fresh = await SiteAudit.findById(siteId);
    const cross = crossPageFindings(crawl.pages, crawl.broken);
    await SiteAudit.updateOne({ _id: siteId }, {
      status: 'done', crossFindings: cross, broken: crawl.broken, skipped: crawl.skipped,
      scores: aggregateScores(fresh.pages.map((p) => ({ scores: p.scores })), cross),
      progress: { done: crawl.pages.length, total: crawl.pages.length, current: '' },
      aiStatus: 'pending', llm: describeLlm(), durationMs: Date.now() - t0,
    });
    scheduleSiteSummary(siteId);
  } catch (e) {
    await SiteAudit.updateOne({ _id: siteId }, { status: 'failed', error: String(e.message).slice(0, 300), durationMs: Date.now() - t0 });
  }
}

/** A crawl cannot survive an API restart: mark leftovers as failed so the UI never waits forever. */
export async function markStaleSiteAudits() {
  const r = await SiteAudit.updateMany({ status: 'running' }, { status: 'failed', error: 'Interrupted by a server restart. Start the site audit again.' });
  return r.modifiedCount;
}

export async function deleteSiteAudit(site) {
  await Audit.deleteMany({ site: site._id, user: site.user });
  await site.deleteOne();
}

export const siteBrief = (s) => ({
  id: String(s._id), url: s.url, status: s.status, error: s.error, scores: s.scores, pageCount: s.pages.length, maxPages: s.maxPages,
  aiStatus: s.aiStatus, rendered: s.rendered, progress: s.progress, createdAt: s.createdAt, durationMs: s.durationMs,
});

export const siteView = (s) => {
  const o = s.toObject();
  o.id = String(o._id); delete o._id; delete o.__v;
  o.pages = o.pages.map((p) => ({ ...p, audit: p.audit && String(p.audit) }));
  return o;
};
