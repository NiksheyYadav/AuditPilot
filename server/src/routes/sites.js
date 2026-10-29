import { Router } from 'express';
import { z } from 'zod';
import { SiteAudit } from '../models/index.js';
import { requireAuth, validate } from '../middleware/index.js';
import { cfg } from '../config.js';
import { deleteSiteAudit, findOwnedSite, siteBrief, siteView, startSiteAudit } from '../services/siteService.js';

const createSchema = z.object({
  url: z.string().trim().min(3).max(2048),
  maxPages: z.number().int().min(1).max(25).optional(),
  render: z.boolean().optional(),
});

/** Site (multi-page) audits: POST starts a background crawl and returns 202; poll GET /:id for progress. */
export function sitesRouter(limiter) {
  const r = Router();
  r.use(requireAuth);

  r.post('/', limiter, validate(createSchema), async (req, res) => {
    const site = await startSiteAudit(req.user.id, req.valid.url, { maxPages: req.valid.maxPages ?? Math.min(10, cfg.crawlMaxPages), render: Boolean(req.valid.render) });
    res.status(202).json(siteView(site));
  });

  r.get('/', async (req, res) => {
    const list = await SiteAudit.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ sites: list.map(siteBrief) });
  });

  r.get('/:id', async (req, res) => res.json(siteView(await findOwnedSite(req.user.id, req.params.id))));

  r.delete('/:id', async (req, res) => {
    await deleteSiteAudit(await findOwnedSite(req.user.id, req.params.id));
    res.status(204).end();
  });
  return r;
}
