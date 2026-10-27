import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { cfg, describeLlm } from '../config.js';
import { Audit, User } from '../models/index.js';
import { runAudit } from '../audit/index.js';
import { topFindings } from '../audit/score.js';

export const DEMO_USER = { name: 'Demo User', email: 'demo@auditpilot.dev', password: 'demo1234' };
const DAY = 86_400_000;

// Template text built from the real findings; flagged seeded:true so the UI labels it as sample data.
function sampleText(result) {
  const top = topFindings(result.findings, 5);
  const s = result.scores;
  const summary = `Sample summary (seeded): overall score ${s.overall}/100 (SEO ${s.seo}, Accessibility ${s.accessibility}, Security ${s.security}, Performance ${s.performance}). ` +
    (top.length ? `Most important issues: ${top.slice(0, 3).map((f) => f.title).join('; ')}.` : 'No outstanding issues found.');
  const fixPlan = top.length ? top.map((f, i) => `${i + 1}. **${f.title}** (${f.severity}) - ${f.recommendation}`).join('\n') : 'Nothing to fix.';
  return { summary, fixPlan };
}

/** Creates the demo user plus a few past audits of the built-in pages (real engine output, backdated). */
export async function seedDemo({ baseUrl = `http://localhost:${cfg.port}`, quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  let user = await User.findOne({ email: DEMO_USER.email });
  if (!user) user = await User.create({ name: DEMO_USER.name, email: DEMO_USER.email, passwordHash: await bcrypt.hash(DEMO_USER.password, 10) });
  if (await Audit.exists({ user: user._id, seeded: true })) { log('[seed] already seeded'); return user; }
  if (!cfg.allowPrivate) { console.warn('[seed] ALLOW_PRIVATE_TARGETS is not true, cannot audit built-in demo pages; skipping sample audits.'); return user; }
  const plan = [['/demo/bad', 9], ['/demo/bad', 6], ['/demo/good', 4], ['/demo/bad', 3], ['/demo/good', 1]];
  for (const [path, daysAgo] of plan) {
    const url = `${baseUrl}${path}`;
    const r = await runAudit(url);
    const text = sampleText(r);
    await Audit.create({
      user: user._id, url, finalUrl: r.finalUrl, scores: r.scores, findings: r.findings, durationMs: r.durationMs,
      ...text, aiStatus: 'ready', seeded: true, llm: { ...describeLlm(), model: 'seeded-sample', mock: false },
      createdAt: new Date(Date.now() - daysAgo * DAY), updatedAt: new Date(Date.now() - daysAgo * DAY),
    });
  }
  log(`[seed] created ${plan.length} sample audits for ${DEMO_USER.email}`);
  return user;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { connectDb, disconnectDb } = await import('../db.js');
  const { createApp } = await import('../app.js');
  if (!cfg.mongoUri) { console.log('MONGO_URI is empty: the in-memory demo DB is seeded automatically by `npm run dev`. Nothing to do.'); process.exit(0); }
  await connectDb();
  const srv = createApp().listen(0);
  await seedDemo({ baseUrl: `http://localhost:${srv.address().port}` });
  srv.close();
  await disconnectDb();
  console.log(`Login: ${DEMO_USER.email} / ${DEMO_USER.password}`);
}
