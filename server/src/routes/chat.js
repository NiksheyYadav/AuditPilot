import { Router } from 'express';
import { z } from 'zod';
import { Audit } from '../models/index.js';
import { requireAuth, validate } from '../middleware/index.js';
import { findOwned } from '../services/auditService.js';
import { runAgent } from '../agent/agent.js';
import { llmHealth } from '../agent/health.js';
import { cfg } from '../config.js';

const schema = z.object({ message: z.string().trim().min(1, 'Message is empty').max(500, 'Message too long (max 500 characters)') });

/** POST /api/audits/:id/chat  -> Server-Sent Events: token | tool_call | tool_result | note | done | error */
export function chatRouter(limiter) {
  const r = Router();
  r.post('/:id/chat', requireAuth, limiter, validate(schema), async (req, res) => {
    const audit = await findOwned(req.user.id, req.params.id); // 404 for other users' audits
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const emit = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    const ctrl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
    const ping = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 10000);

    try {
      if (cfg.llmProvider !== 'mock') {
        const h = await llmHealth({ force: true });
        if (!h.reachable || !h.modelInstalled) { emit('error', { message: `${h.error}. The audit itself is unaffected; start Ollama to chat.` }); return; }
      }
      const history = audit.chat.map((m) => ({ role: m.role, content: m.content }));
      await Audit.updateOne({ _id: audit._id }, { $push: { chat: { role: 'user', content: req.valid.message } } });
      const msg = await runAgent({ audit, userId: req.user.id, message: req.valid.message, history, emit, signal: ctrl.signal });
      await Audit.updateOne({ _id: audit._id }, { $push: { chat: msg } });
    } catch (e) {
      if (!ctrl.signal.aborted) emit('error', { message: /timed out|timeout/i.test(e.message) ? 'The local model took too long to respond. Try again, or warm it up with: npm run warmup:llm' : `Chat failed: ${e.message}` });
    } finally {
      clearInterval(ping);
      res.end();
    }
  });
  return r;
}
