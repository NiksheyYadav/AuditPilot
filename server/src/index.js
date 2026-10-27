import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { cfg } from './config.js';
import { seedDemo } from './scripts/seed.js';

if (cfg.allowPrivate) console.warn('[warn] ALLOW_PRIVATE_TARGETS=true: SSRF protection for private addresses is OFF. Use for local demo only.');
if (cfg.jwtSecret === 'dev-only-secret-change-me') console.warn('[warn] JWT_SECRET not set, using an insecure dev default.');

await connectDb();
const server = createApp().listen(cfg.port, async () => {
  console.log(`AuditPilot API on http://localhost:${cfg.port}  (LLM: ${cfg.llmProvider}/${cfg.llmModel})`);
  if (!cfg.mongoUri) {
    try { await seedDemo({ quiet: true }); console.log('[seed] Demo login ready: demo@auditpilot.dev / demo1234'); }
    catch (e) { console.warn('[seed] failed:', e.message); }
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { server.close(); await disconnectDb(); process.exit(0); });
