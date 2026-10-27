import { Router } from 'express';
import { z } from 'zod';
import { Audit } from '../models/index.js';
import { requireAuth, validate } from '../middleware/index.js';
import { brief, createAudit, decorate, findOwned } from '../services/auditService.js';
import { compareAudits } from '../audit/compare.js';

const createSchema = z.object({ url: z.string().trim().min(3).max(2048), render: z.boolean().optional() });
const compareSchema = z.object({ a: z.string(), b: z.string() });
const trendSchema = z.object({ url: z.string().trim().min(3).max(2048) });


export const auditsRouter = Router();
auditsRouter.use(requireAuth);

export const withAuditLimiter = (limiter) => auditsRouter.post('/', limiter);

auditsRouter.post('/', validate(createSchema), async (req, res) => {
  let url = req.valid.url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  const audit = await createAudit(req.user.id, url, { render: req.valid.render });
  res.status(201).json(decorate(audit));
});

auditsRouter.get('/', async (req, res) => {
  const list = await Audit.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).select('-chat');
  res.json({ audits: list.map(brief) });
});

auditsRouter.get('/compare', validate(compareSchema, 'query'), async (req, res) => {
  const [a, b] = await Promise.all([findOwned(req.user.id, req.valid.a), findOwned(req.user.id, req.valid.b)]);
  res.json(compareAudits(a.toObject(), b.toObject()));
});

auditsRouter.get('/trend', validate(trendSchema, 'query'), async (req, res) => {
  const list = await Audit.find({ user: req.user.id, url: req.valid.url }).sort({ createdAt: 1 }).limit(50).select('scores createdAt');
  res.json({ url: req.valid.url, points: list.map((a) => ({ id: String(a._id), createdAt: a.createdAt, ...a.scores.toObject() })) });
});

auditsRouter.get('/:id', async (req, res) => res.json(decorate(await findOwned(req.user.id, req.params.id))));

auditsRouter.delete('/:id', async (req, res) => {
  const audit = await findOwned(req.user.id, req.params.id);
  await audit.deleteOne();
  res.status(204).end();
});
