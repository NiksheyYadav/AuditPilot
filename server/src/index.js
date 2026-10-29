import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { cfg } from './config.js';
import { seedDemo } from './scripts/seed.js';
import { startScheduler } from './services/scheduler.js';
import { markStaleSiteAudits } from './services/siteService.js';
import { warmModel } from './agent/health.js';

if (cfg.allowPrivate) console.warn('[warn] ALLOW_PRIVATE_TARGETS=true: SSRF protection for private addresses is OFF. Use for local demo only.');
if (cfg.jwtSecret === 'dev-only-secret-change-me') console.warn('[warn] JWT_SECRET not set, using an insecure dev default.');

await connectDb();
const stale = await markStaleSiteAudits();
if (stale) console.warn(`[sites] marked ${stale} interrupted site audit(s) as failed`);
const server = createApp().listen(cfg.port, async () => {
  console.log(`AuditPilot API on http://localhost:${cfg.port}  (LLM: ${cfg.llmProvider}/${cfg.llmModel})`);
  startScheduler();
  if (cfg.llmProvider !== 'mock') warmModel().then((ms) => console.log(`[llm] ${cfg.llmModel} warmed in ${(ms / 1000).toFixed(1)} s`)).catch(() => console.log('[llm] Ollama not reachable: audits work, AI features are off until it starts'));
  if (!cfg.mongoUri) {
    try { await seedDemo({ quiet: true }); console.log('[seed] Demo login ready: demo@auditpilot.dev / demo1234'); }
    catch (e) { console.warn('[seed] failed:', e.message); }
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { server.close(); await disconnectDb(); process.exit(0); });
