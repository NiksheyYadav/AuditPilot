# AuditPilot - AI Website Audit Agent (MERN + local open-source LLM)

A logged-in user enters a URL. **Deterministic tools** audit it (SEO, accessibility, security, performance) and produce evidence and scores. A **local open-source LLM agent** (Ollama, no cloud, no API keys) then explains the results, prioritises fixes and answers follow-up questions, calling tools when needed.

> **Core principle: tools compute the facts, the LLM only explains them.** The full audit and score appear instantly even if the LLM is off or slow. The LLM adds a summary, a fix plan and chat.

Built by Nikshey Yadav (Roll No. 231302221, B.Tech CSE Data Science, SGT University) for the AccioJobs industrial training project.

## Quick start

Requirements: Node 22+ (tested on Node 24), npm. Ollama is optional (see below).

```bash
npm run setup     # installs root, server and client, creates server/.env from .env.example
npm run dev       # API on :4000 and UI on http://localhost:5173 (one terminal)
```

With `MONGO_URI` empty the server starts a local MongoDB (mongodb-memory-server) and prints a `DEMO DB` banner. By default (`DEMO_DB_PERSIST=true`) its files live in `server/.data/mongo`, so **accounts, audits and chat history survive restarts** (delete that folder to reset). Set `DEMO_DB_PERSIST=false` for a pure in-memory DB that resets on every restart. It also seeds a demo login:

| Email | Password |
|---|---|
| demo@auditpilot.dev | demo1234 |

(The first run downloads a MongoDB binary of about 120 MB once; it is cached afterwards.)

Then open http://localhost:5173, log in and press **Audit demo (bad)** and **Audit demo (good)**.

| Command | What it does |
|---|---|
| `npm run setup` | install everything, create `server/.env` |
| `npm run dev` | server + client together |
| `npm run test:live` | opt-in tests against the REAL local model (needs Ollama running) |
| `npm run seed` | seed a persistent DB (only needed when `MONGO_URI` is set; the in-memory DB seeds itself) |
| `npm test` | all server tests (vitest + supertest + mongodb-memory-server) |
| `npm run check:llm` | checks Ollama, the model, one tool-call round trip, prints latency |
| `npm run warmup:llm` | loads the model into RAM before the demo |
| `npm run mcp` | starts the MCP stdio server |
| `npm run build` | production build of the client (served by the API on :4000) |

## Accounts and history

- **Sign up / sign in** with name, email and password (min 8 characters, confirmed on sign-up). Passwords are bcrypt-hashed; the API issues a 7-day JWT. Every request re-checks that the account still exists, so a token that outlived its database (for example after a reset) gets a clear "please sign in again" instead of half-working.
- **History page:** every audit with score, issues, AI status and saved chat size; search by URL, paging, delete, and tick two audits to compare. Chat history is saved per audit, reloads with the report, and can be cleared with **Clear chat**.

## What is in the box (beyond the basic audit)

- **Render JavaScript:** tick the checkbox (or send `render: true`) and the page is loaded in a headless Chrome/Edge before the checks run, so client-side apps are audited fairly. No browser is downloaded: it uses the Chrome/Edge/Chromium already installed (or `CHROME_PATH`). Every request the browser makes, including redirects and sub-resources, goes through the same SSRF guard. Try it on `/demo/spa`.
- **Scheduled audits:** re-audit a URL every 1 h / 6 h / 24 h / 7 d from the dashboard (max 5 per user). Runs happen inside the API process, are saved like normal audits and feed the trend chart.
- **Link check:** up to `AUDIT_MAX_LINKS` same-origin links (default 50, max 100); the evidence says how many were found.
- **Model warm-up:** the server loads the Ollama model at startup, so the first answer is not slow.
- **Small-model friendly agent:** audits are referenced by short 8-character refs, `get_remediation` accepts a finding title, and the chat context contains no raw ids.

## Local LLM with Ollama

1. Install Ollama
   - **Windows:** `winget install Ollama.Ollama` (or the installer from https://ollama.com/download)
   - **macOS:** `brew install ollama` (or the app from ollama.com)
   - **Linux:** `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a model that supports **tool calling**: `ollama pull qwen2.5:3b` (about 1.9 GB). Verify with `ollama show qwen2.5:3b` (the Capabilities list must contain `tools`).
3. `npm run check:llm` then `npm run warmup:llm`.

**RAM guidance:** 7-8B models (`qwen2.5:7b`, `llama3.1:8b`) want about 8 GB of *free* RAM. With less, use a 3B model (`qwen2.5:3b`, `llama3.2:3b`). The default is `qwen2.5:3b`. Set the model in `server/.env` (`LLM_MODEL=...`).

**Keep the model loaded:** Ollama unloads models after 5 minutes. Start the Ollama server with `OLLAMA_KEEP_ALIVE=30m` (Windows: set it as a user environment variable and restart Ollama) so the first answer in a demo is not slow. `npm run warmup:llm` loads the model right now.

The header badge shows the real state from `/api/health`: `Local LLM: <model> (Ollama)`, `MOCK LLM` (scripted provider, never pretends to be a model) or `Local LLM offline - audits still work`.

**Mock provider:** `LLM_PROVIDER=mock` gives deterministic scripted answers. It is used by the tests and as an emergency offline fallback.

## Architecture

```
React 19 + Vite  --/api-->  Express 5  --Mongoose-->  MongoDB (Atlas or in-memory)
 (Recharts, SSE)               |
                               +-- audit engine (cheerio, SSRF-guarded fetch)  -> findings + scores  [no LLM]
                               +-- tool registry (zod)  <-- used by both:
                               |       +-- agent loop -> LLM queue (concurrency 1) -> Ollama (OpenAI-compatible API)
                               |       +-- MCP stdio server (Claude Code / Claude Desktop)
                               +-- background summary job: aiStatus pending -> ready | skipped | failed
```

- `server/src/audit/` checkers, scoring, remediation map, SSRF guard, SSRF-safe fetcher
- `server/src/agent/` LLM providers (`llm/openaiCompat.js`, `llm/mock.js`), queue, tools, agent loop, summary job
- `server/src/mcp/server.js` MCP server over the same tool registry
- `server/src/routes/` auth, audits, chat (SSE), built-in demo pages

### Agent design (built for small local models)
- Audits never wait on the LLM. The summary and fix plan are generated in the background; the UI polls and shows "AI is writing the summary...".
- LLM calls go through one in-process queue (concurrency 1), 120 s timeout, temperature 0.1, top ~10 findings only.
- Chat preloads the current audit (scores, top findings, other audit ids) into the system prompt so most questions need no tool call.
- 5 tools: `run_audit`, `get_audit`, `list_my_audits`, `compare_audits`, `get_remediation`. Arguments are validated with zod; invalid or malformed arguments are fed back once, then the agent answers gracefully and the UI shows a note. Max 5 steps. Handlers get `userId` from the JWT, never from model output.
- SSE events: `token`, `tool_call`, `tool_result`, `note`, `done`, `error`. Streaming together with tool calls was tested on the installed Ollama (`npm run check:llm`); if your Ollama build cannot do it, set `LLM_STREAM_TOOLS=false` and the finished answer is delivered at the end of the round.
- Every tool call (name, args, result summary, ms) is stored with the chat message and shown as a collapsible trace.

## Scoring rules (deterministic)

Each finding has a severity: `high`, `medium`, `low` or `pass`.

- Each category (SEO, Accessibility, Security, Performance) starts at **100** and loses **15 / 7 / 3** points per high / medium / low finding, floor 0.
- **Overall** = weighted average, rounded: Security 30 %, SEO 25 %, Accessibility 25 %, Performance 20 %.

29 checks: SEO (title, meta description, H1, canonical, Open Graph, viewport, robots.txt, sitemap.xml, broken links), Accessibility (lang, image alt, form labels, heading order, link/button names), Security (HTTPS, HSTS, CSP, X-Content-Type-Options, clickjacking protection, Referrer-Policy, Permissions-Policy, cookie flags, technology disclosure), Performance (response time, HTML size, compression, Cache-Control, resource count, render-blocking scripts). Note: the local demo pages are served over plain HTTP, so even `/demo/good` loses 15 points on the HTTPS check; this is intentional and honest. A static remediation map (`server/src/audit/remediation.js`) provides fix snippets (Express/helmet and Nginx) per check without any LLM.

## SSRF guard

The server fetches user-supplied URLs, so every fetch goes through `server/src/audit/ssrf.js` and `fetcher.js`:

- http/https only; no credentials in URLs
- DNS is resolved and loopback, private (10/8, 172.16/12, 192.168/16), link-local, CGNAT, multicast and cloud-metadata (169.254.169.254, `metadata.google.internal`) addresses are blocked, including IPv6 and IPv4-mapped IPv6
- the check runs again at connect time (custom `lookup`), so DNS rebinding cannot swap the address
- max 3 redirects, each hop re-validated; 10 s timeout; 2 MB body cap
- per-user rate limit on audits (`AUDIT_RATE_LIMIT`, default 20/min) and on chat (`CHAT_RATE_LIMIT`)
- `ALLOW_PRIVATE_TARGETS=true` (in `.env.example`, **dev/demo only**) disables the private-address block so `/demo/bad` and `/demo/good` on localhost can be audited. The server warns about it on startup. Turn it off in production.

## MCP server (use AuditPilot from Claude Code / Claude Desktop)

`server/src/mcp/server.js` is a stdio MCP server exposing the same tool registry: `audit_url`, `get_audit`, `list_audits`, `compare_audits`, `get_remediation`. It acts as the user in `AUDITPILOT_USER_EMAIL` (default `demo@auditpilot.dev`) and uses `MONGO_URI` (use a real Mongo or Atlas if you want history to persist between runs).

Claude Code:
```bash
claude mcp add auditpilot -e ALLOW_PRIVATE_TARGETS=false -e MONGO_URI="mongodb://localhost:27017/auditpilot" -- node C:/AuditPilot/server/src/mcp/server.js
```
Then ask: "Use auditpilot to audit https://example.com and tell me what to fix first."

Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "auditpilot": {
      "command": "node",
      "args": ["C:/AuditPilot/server/src/mcp/server.js"],
      "env": { "MONGO_URI": "mongodb://localhost:27017/auditpilot", "AUDITPILOT_USER_EMAIL": "demo@auditpilot.dev" }
    }
  }
}
```
(Adjust the path to where you cloned the repo. With `MONGO_URI` empty it falls back to an in-memory DB that resets every launch.)

## MongoDB Atlas (free tier)

1. https://www.mongodb.com/cloud/atlas/register -> create a free **M0** cluster.
2. Database Access -> add a database user (username + password).
3. Network Access -> allow your IP (or `0.0.0.0/0` for a demo only).
4. Connect -> Drivers -> copy the connection string and put it in `server/.env`:
   `MONGO_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/auditpilot`
5. `npm run seed`, then `npm run dev`.

## API

`POST /api/auth/register|login`, `GET /api/auth/me` - `POST/GET /api/audits`, `GET/DELETE /api/audits/:id`, `GET /api/audits/compare?a=&b=`, `GET /api/audits/trend?url=` - `POST /api/audits/:id/chat` (SSE) - `GET /api/health` (LLM mode and model). Zod validation, central error handler, JWT auth, ownership checks (other users' audits return 404).

## Tests

`npm test` runs checker tests against the bad and good fixtures, scoring, the SSRF guard (localhost, 10.x, 169.254.169.254, redirects, non-http schemes), auth and ownership, the agent loop with the mock LLM (tool call then answer, invalid args, step cap), background summary status transitions, compare, SSE chat, JavaScript rendering, schedules, short refs, the link cap and an MCP stdio client test. Real local-model behaviour has its own opt-in suite, `npm run test:live` (summary quality, streamed answer, a real tool call), plus `npm run check:llm`.

## Known limitations

- A 3B local model on CPU answers in roughly 15-40 s and can be imprecise (that is why scores never depend on it).
- Rendering JavaScript needs an installed Chrome/Edge/Chromium and takes longer (about 5-30 s per audit).
- The demo DB is a local file database (`server/.data/mongo`); use `MONGO_URI` (Atlas free tier) for a hosted one. `npm run mcp` while the API is running uses its own in-memory DB unless you give it the same `MONGO_URI`. Scheduled audits only run while the API process is running.
- Local demo pages are served over HTTP, so even `/demo/good` loses points on the HTTPS check.
