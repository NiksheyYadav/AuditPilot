# AuditPilot - Q&A prep (Hinglish, Roman script)

**1. Ye project kaun si problem solve karta hai?**
Website ka SEO, accessibility, security aur performance manually check karna slow hota hai. AuditPilot URL daalte hi sab check karke score, evidence aur fix de deta hai, aur AI se samjha bhi deta hai ki pehle kya theek karna hai.

**2. Isme AI agent kya karta hai?**
Agent audit ke results ko simple language mein explain karta hai, fix ki priority batata hai, aur follow-up sawalon ka jawab deta hai. Zarurat pade to tools call karta hai, jaise purane audits dekhna, do audits compare karna ya fix ka code snippet lana.

**3. MERN stack hi kyun?**
React se interactive UI (charts, live chat) banana easy hai, Express/Node mein URL fetch aur HTML parsing (cheerio) natural hai, aur MongoDB mein audit ka nested data (findings, chat, tool calls) ek document mein ache se fit hota hai. Poora project ek hi language, JavaScript, mein hai.

**4. Sirf LLM se audit kyun nahi karte? Deterministic checks kyun?**
LLM galat number ya findings bana sakta hai (hallucination). Isliye facts tools nikalte hain: har score fixed rule se aata hai (15/7/3 points ka penalty). LLM sirf un facts ko explain karta hai. Isse score repeatable hai aur LLM band ho tab bhi audit poora chalta hai.

**5. Open-source local model (Ollama) kyun, cloud API kyun nahi?**
Privacy: audit data machine se bahar nahi jaata. Cost zero hai, koi API key nahi chahiye, aur internet ke bina bhi chalta hai. Demo mein bhi koi cloud dependency nahi.

**6. Local model ke trade-offs kya hain?**
Ye slow hai (3B model CPU par 15-30 second leta hai) aur bade cloud models se kam smart hai, tool calling bhi kabhi galat ho sakti hai. Isliye maine audit ko LLM se alag rakha, background summary, queue, timeout aur zod validation lagaye.

**7. MCP kya hai aur aapne kyun use kiya?**
MCP (Model Context Protocol) ek standard hai jisse AI apps (Claude Code, Claude Desktop) external tools se baat kar sakte hain. Maine wahi tool registry MCP server se expose ki, to Claude Code mein bol sakte hain "audit my site" aur wo mere tools chalata hai.

**8. Hallucination se kaise bachte ho?**
Teen tareeke: (1) scores aur findings tools se aate hain, LLM nahi banata, (2) chat mein current audit ka real data system prompt mein pehle se daal diya jaata hai aur rule hai "sirf is data se jawab do", (3) temperature kam rakha hai aur tool calls ka trace UI mein dikhta hai, to jawab verify ho sakta hai.

**9. Agar model available na ho to kya hota hai?**
Audit, score, findings aur fix snippets phir bhi poore chalte hain. Summary "skipped" ho jaati hai aur header mein "Local LLM offline" dikhta hai. Chat saaf error message deta hai. Emergency ke liye mock provider hai, aur wo UI mein "MOCK LLM" badge ke saath clearly dikhta hai.

**10. Security ke liye kya kiya?**
Kyunki hum user ke diye URL fetch karte hain, SSRF guard hai: sirf http/https, DNS resolve karke private, localhost aur cloud-metadata addresses block, max 3 redirects (har ek re-validate), 10 second timeout, 2 MB limit. Saath mein JWT auth, bcrypt passwords, helmet, rate limit aur ownership checks hain: ek user doosre ka audit nahi dekh sakta.

**11. Agent ki loop kaise kaam karti hai?**
User ka sawal aata hai, agent model ko audit context ke saath bhejta hai. Model ya seedha jawab deta hai ya tool call maangta hai. Server zod se arguments validate karke tool chalata hai, result model ko wapas deta hai. Maximum 5 steps hote hain, aur galat arguments par ek baar retry ke baad graceful jawab.

**12. Testing kaise ki?**
Vitest aur supertest se: har checker bad/good HTML par, scoring, SSRF guard, auth aur ownership, agent loop (mock LLM ke saath), background summary status, compare, site crawl (robots.txt, same-origin limit, cross-page checks, aggregate score) aur MCP stdio test. Total 104 tests pass hote hain. Asli local model ka behaviour `npm run check:llm` aur manual run se check kiya, kyunki wo CI ke liye reliable nahi hai.

**13. Limitations kya hain?**
Local model CPU par slow hai (15 se 40 second) aur kabhi imprecise hota hai, isliye scores kabhi LLM par depend nahi karte. JavaScript render ke liye Chrome ya Edge installed hona chahiye. In-memory demo DB restart par reset hota hai (Atlas se persistent ho jata hai), aur scheduled audits tabhi chalte hain jab server chal raha ho. Site crawl links follow karke aur root ke sitemap.xml se pages dhoondhta hai (sirf /sitemap.xml, aur koi sitemap location nahi), maximum 25 pages, aur restart par adhura crawl failed mark ho jata hai.

**14. Future scope kya hai?**
Bada ya fine-tuned model, WCAG aur OWASP docs par RAG, scheduled audits ke email alerts, CI/CD integration (score gire to build fail), aur zyada checks jaise Lighthouse-style metrics.

**15. Training mein kya kya seekha aur kya extra kiya?**
Training mein HTML, CSS, JavaScript, React, AI, AI agents, thoda Node.js aur MCP basics cover hue. Express, MongoDB aur JWT training mein nahi the, unhe maine Claude Code ke saath AI-assisted development se seekha aur use kiya.

**16. Kya ye project aapne akele banaya?**
Honest jawab: design, requirements, decisions aur testing meri responsibility thi, aur coding ka bada hissa maine AI assistant (Claude Code) ke saath mil kar kiya. Isiliye main architecture, flow aur har feature ko explain kar sakta hoon, aur jo cheezein training ke bahar ki hain (Express, MongoDB, JWT), unhe maine openly bataya hai.

**17. Poori website kaise audit hoti hai? Firecrawl ya Scrapy kyun nahi?**
Dashboard par "Audit the whole site" tick karte hain. Background job same-origin pages breadth-first crawl karta hai (5, 10 ya 25 pages tak), links se aur sitemap.xml se, aur har page ek normal audit ban jata hai. Crawler polite hai: robots.txt maanta hai, har page ke beech delay rakhta hai, aur har request wahi SSRF guard se guzarti hai. Agar koi page doosri site par redirect ho jaye to wo audit nahi hota. Phir site-level checks chalte hain: duplicate titles, duplicate descriptions aur broken internal pages, aur site score pages ka average minus in cross-page issues ki penalty hai. Firecrawl cloud paid service hai, aur humne "no cloud, no paid API" rakha hai. Scrapy Python hai aur hamara stack Node hai, saath mein usse SSRF guard aur scoring dobara banane padte. Isliye hamare apne guarded fetcher par chhota crawler banaya.
