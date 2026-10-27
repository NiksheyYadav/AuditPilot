# AuditPilot - 4 minute live demo script

## Before you walk in (5 minutes, do it once)
1. Close heavy apps (browser tabs, IDEs) so Ollama has free RAM. A 3B model needs about 2.5 GB.
2. `ollama list` shows `qwen2.5:3b`. Start Ollama with `OLLAMA_KEEP_ALIVE=30m` if you can.
3. `npm run warmup:llm` (loads the model, takes about 10 s).
4. `npm run dev`, open http://localhost:5173, log in with the demo account (button **Fill demo login**).
5. Check the header badge: green `Local LLM: qwen2.5:3b (Ollama)`. If it says MOCK LLM or offline, say so honestly (see Fallbacks).
6. Optional: `claude mcp add ...` from the README, so the MCP step works.

## The flow

| Time | You do | You say (Hinglish, short) |
|---|---|---|
| 0:00 | Dashboard. Point at the form and the two demo buttons. | "AuditPilot ek AI website audit agent hai. Tools facts nikalte hain, LLM sirf explain karta hai." |
| 0:20 | Click **Audit demo (bad)**. Report opens instantly. | "Dekhiye, score turant aa gaya: 54. Ye LLM ke bina nikla hai, deterministic rules se." |
| 0:40 | Show gauge and 4 category scores. Open the first red finding. | "Har finding mein evidence hai, aur fix ka code snippet bhi, jaise CSP ka Express aur Nginx dono." |
| 1:00 | Point at "AI is writing the summary..." then keep talking over the findings. Filter by `high`. | "Summary background mein local model likh raha hai, isliye app block nahi hota. Tab tak findings dekhte hain: HTTPS, CSP, alt text, labels." |
| 1:30 | Summary appears. In chat press **What should I fix first?** | "Ye answer 3B open-source model ne laptop par likha, internet ya cloud API nahi." |
| 2:00 | Ask: "Compare this with my previous audits". Expand **Tool trace**. | "Yahan agent ne khud tool call kiya: list_my_audits. Trace mein args aur time dikhta hai. Model sirf tool maangta hai, user ID server se aati hai." |
| 2:30 | Back to Dashboard, click **Audit demo (good)**. | "Wahi page, fixes ke baad. Score 96." |
| 2:50 | Report -> **Compare with...** -> choose the bad audit (or use Compare page: A = bad, B = good). | "Score 54 se 96, aur yahan fixed issues ki list hai. Sirf HTTPS bacha, kyunki local demo http par hai." |
| 3:20 | Click **Export Markdown** (or Print). Show the trend chart on the dashboard. | "Report export ho sakti hai, aur har URL ka trend chart bhi hai." |
| 3:30 | Click **Audit nikshey.xyz** (a real website). Tick **Render JavaScript** if you want to show it. Open **Scheduled audits** and schedule it daily. | "Ye real website hai, nikshey.xyz. Same engine, aur scheduled audit se har din apne aap re-audit hota hai." |
| 3:40 | Switch to Claude Code (or Claude Desktop). Type: "Use auditpilot to audit http://localhost:4000/demo/bad". | "Same tools MCP server ke through Claude Code mein bhi chalte hain. Ek tool registry, do clients." |
| 4:00 | Done. | "Security: SSRF guard, JWT, ownership checks, aur tests pass hain. Questions?" |

## If the local model is slow
- A 3B model on CPU takes **15-30 s** per answer. This is normal. Do not apologise, narrate: "Model locally chal raha hai, isliye 20 second lagte hain, cloud hota to turant aata, lekin yahan data machine se bahar nahi jaata."
- While "AI is writing the summary..." shows, keep talking over the findings (step at 1:00). Scores and findings never wait for the model.
- Ask only **one** chat question live if time is short (the tool-trace one is the most impressive).
- If the first answer is very slow, it is the model loading: run `npm run warmup:llm` before the demo next time.
- Do not ask two chat questions at once: the queue handles one LLM call at a time.

## Fallbacks
- **Ollama not running:** header shows "Local LLM offline - audits still work". Say: "Yeh graceful degradation hai: audit phir bhi poora chalta hai." Run `ollama serve` and refresh.
- **Emergency:** set `LLM_PROVIDER=mock` in `server/.env` and restart. The header shows the amber **MOCK LLM** badge; say clearly that these are scripted replies, not a real model.
- **Port busy / DB error:** `npm run dev` again; the in-memory DB resets and re-seeds the demo login.
- **Pre-seeded audits** show "sample" in the AI column: their summary text is seeded sample data built from the real findings.
