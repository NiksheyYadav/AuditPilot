import { Router } from 'express';
import { z } from 'zod';
import { Schedule } from '../models/index.js';
import { AppError, isId, requireAuth, validate } from '../middleware/index.js';
import { assertSafeUrl } from '../audit/ssrf.js';

export const MAX_SCHEDULES = 5;
const schema = z.object({
  url: z.string().trim().min(3).max(2048),
  everyHours: z.number().int().min(1).max(168),
  render: z.boolean().optional(),
});
const pub = (s) => ({ id: String(s._id), url: s.url, everyHours: s.everyHours, render: s.render, enabled: s.enabled, nextRunAt: s.nextRunAt, lastRunAt: s.lastRunAt, lastAuditId: s.lastAuditId && String(s.lastAuditId), lastError: s.lastError });

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

schedulesRouter.get('/', async (req, res) => res.json({ schedules: (await Schedule.find({ user: req.user.id }).sort({ createdAt: -1 })).map(pub) }));

schedulesRouter.post('/', validate(schema), async (req, res) => {
  let url = req.valid.url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  await assertSafeUrl(url); // reject blocked targets at creation time, not at run time
  if ((await Schedule.countDocuments({ user: req.user.id })) >= MAX_SCHEDULES) throw new AppError(409, `You can have at most ${MAX_SCHEDULES} scheduled audits`);
  const s = await Schedule.create({ user: req.user.id, url, everyHours: req.valid.everyHours, render: Boolean(req.valid.render), nextRunAt: new Date() });
  res.status(201).json(pub(s));
});

schedulesRouter.delete('/:id', async (req, res) => {
  const s = isId(req.params.id) ? await Schedule.findOne({ _id: req.params.id, user: req.user.id }) : null;
  if (!s) throw new AppError(404, 'Schedule not found');
  await s.deleteOne();
  res.status(204).end();
});
