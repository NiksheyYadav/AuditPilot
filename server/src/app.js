import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cfg, describeLlm } from './config.js';
import { demoRouter } from './routes/demo.js';
import { authRouter } from './routes/auth.js';
import { auditsRouter } from './routes/audits.js';
import { chatRouter } from './routes/chat.js';
import { schedulesRouter } from './routes/schedules.js';
import { findBrowser } from './audit/render.js';
import { errorHandler, notFound, requireAuth } from './middleware/index.js';
import { llmHealth } from './agent/health.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ auditRateLimit = cfg.auditRateLimit, chatRateLimit = cfg.chatRateLimit } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(demoRouter); // before helmet: demo targets control their own headers
  app.use(helmet());
  app.use(cors({ origin: cfg.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  const perUser = (max) => rateLimit({
    windowMs: 60_000, limit: max, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `u:${req.user?.id || 'anon'}`, validate: { keyGeneratorIpFallback: false },
    handler: (req, res) => res.status(429).json({ error: { message: 'Too many requests, slow down and retry in a minute' } }),
  });
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 100, skip: () => process.env.NODE_ENV === 'test', standardHeaders: true, legacyHeaders: false });

  app.get('/api/health', async (req, res) => res.json({ status: 'ok', llm: { ...describeLlm(), ...(await llmHealth()) }, allowPrivateTargets: cfg.allowPrivate, renderAvailable: Boolean(findBrowser()), demoBase: `http://localhost:${cfg.port}` }));
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/schedules', schedulesRouter);
  app.post('/api/audits', requireAuth, perUser(auditRateLimit));
  app.use('/api/audits', chatRouter(perUser(chatRateLimit)));
  app.use('/api/audits', auditsRouter);
  app.use('/api', notFound);

  const dist = path.join(here, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|demo).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
