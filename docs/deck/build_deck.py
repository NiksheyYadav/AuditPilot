import os
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

SHOTS = r'C:\AuditPilot\docs\screenshots'
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_crops'); os.makedirs(TMP, exist_ok=True)
OUT = r'C:\AuditPilot\AuditPilot_IT2_Presentation.pptx'

def C(h): return RGBColor.from_string(h)
INK, MUTED, BG, WHITE, LINE = '1C1736', '6B6788', 'FAF7FF', 'FFFFFF', 'E6E2F3'
AMETHYST, FUCHSIA, EMERALD, AMBER, RUBY, SAPPHIRE = '6D28D9', 'C026D3', '059669', 'D97706', 'E11D48', '2563EB'
SOFT = {AMETHYST: 'EDE9FE', FUCHSIA: 'FAE8FF', EMERALD: 'D1FAE5', AMBER: 'FEF3C7', RUBY: 'FFE4E6', SAPPHIRE: 'DBEAFE'}
F, FB = 'Segoe UI', 'Segoe UI Semibold'

prs = Presentation(); prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
count = [0]

def bg(s, dark=False):
    f = s.background.fill
    if dark:
        f.gradient(); f.gradient_angle = 35
        f.gradient_stops[0].color.rgb = C('2E1065'); f.gradient_stops[1].color.rgb = C('A21CAF')
    else:
        f.solid(); f.fore_color.rgb = C(BG)

def shape(s, kind, x, y, w, h, fill=WHITE, line=None, radius=0.1, lw=1.0):
    sh = s.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.shadow.inherit = False
    if fill is None: sh.fill.background()
    else: sh.fill.solid(); sh.fill.fore_color.rgb = C(fill)
    if line: sh.line.color.rgb = C(line); sh.line.width = Pt(lw)
    else: sh.line.fill.background()
    if kind == MSO_SHAPE.ROUNDED_RECTANGLE: sh.adjustments[0] = radius
    return sh

def card(s, x, y, w, h, fill=WHITE, line=LINE, radius=0.06): return shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill, line, radius)

def text(s, x, y, w, h, paras, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, margin=0.05, spacing=1.0):
    """paras: list of (text, size, bold, color) or a single tuple."""
    if isinstance(paras, tuple): paras = [paras]
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame
    tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(margin); tf.margin_top = tf.margin_bottom = Inches(0.03)
    for i, (t, size, bold, color) in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align; p.line_spacing = spacing
        if i: p.space_before = Pt(size * 0.45)
        r = p.add_run(); r.text = t; r.font.size = Pt(size); r.font.bold = False
        r.font.name = FB if bold else F; r.font.color.rgb = C(color)
    return tb

def boxed(s, x, y, w, h, title, sub=None, color=AMETHYST, fill=None, tsize=15, ssize=11.5, dark_text=False):
    fl = fill or color
    shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fl, None, 0.12)
    tc = INK if dark_text else WHITE
    paras = [(title, tsize, True, tc)] + ([(sub, ssize, False, tc)] if sub else [])
    text(s, x, y, w, h, paras, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE, 0.08)

def arrow(s, x1, y1, x2, y2, color=MUTED, w=2.25):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = C(color); c.line.width = Pt(w)
    ln = c.line._get_or_add_ln(); t = etree.SubElement(ln, qn('a:tailEnd')); t.set('type', 'triangle'); t.set('w', 'med'); t.set('len', 'med')
    return c

def new(kicker, title, dark=False, notes=''):
    s = prs.slides.add_slide(BLANK); count[0] += 1; bg(s, dark)
    if not dark:
        shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 0.62, 0.09, 0.95, FUCHSIA, None, 0.5)
        text(s, 0.92, 0.5, 11, 0.35, (kicker.upper(), 12, True, FUCHSIA))
        text(s, 0.92, 0.82, 11.6, 0.8, (title, 32, True, INK))
        text(s, 0.7, 7.05, 6, 0.3, ('AuditPilot  ·  Nikshey Yadav', 10, False, MUTED))
        text(s, 11.9, 7.05, 0.75, 0.3, (str(count[0]), 10, True, MUTED), PP_ALIGN.RIGHT)
    s.notes_slide.notes_text_frame.text = notes
    return s

def crop(src, box, name):
    im = Image.open(os.path.join(SHOTS, src)).convert('RGB')
    if box is None: return os.path.join(SHOTS, src)
    im.crop(box).save(os.path.join(TMP, name), quality=92); return os.path.join(TMP, name)

# ---------------------------------------------------------------- 1 Title
s = new('', '', dark=True, notes=(
    "Namaste, main Nikshey Yadav hoon, SGT University se B.Tech CSE Data Science, 7th semester.\n"
    "Meri training AccioJobs Pvt. Ltd. mein thi, aur ye mera project hai: AuditPilot.\n"
    "AuditPilot ek AI website audit agent hai: tools facts nikalte hain, local LLM unhe explain karta hai.\n"
    "Slide par jo 54 aur 96 hai, wo mere project ke do demo pages ka asli audit score hai."))
text(s, 0.9, 0.8, 6, 0.4, ('INDUSTRIAL TRAINING PROJECT  ·  IT-2', 13, True, 'F5D0FE'))
text(s, 0.9, 1.5, 7.5, 1.4, ('AuditPilot', 72, True, WHITE))
text(s, 0.9, 2.95, 7.2, 1.3, ('An AI website audit agent. Tools compute the facts; a local open-source LLM explains them.', 22, False, 'EDE9FE'), spacing=1.05)
text(s, 0.9, 5.0, 7.5, 1.6, [('Nikshey Yadav  ·  Roll No. 231302221', 20, True, WHITE),
    ('B.Tech CSE (Data Science)  ·  7th Semester  ·  SGT University', 15, False, 'EDE9FE'),
    ('Training: AccioJobs Pvt. Ltd.  ·  8 August to 18 March', 15, False, 'EDE9FE')])
card(s, 8.9, 1.45, 3.7, 4.3, WHITE, None, 0.07)
text(s, 8.9, 1.65, 3.7, 0.4, ('SAME PAGE, BEFORE AND AFTER FIXES', 10.5, True, MUTED), PP_ALIGN.CENTER)
text(s, 9.0, 2.1, 1.6, 1.3, ('54', 60, True, AMBER), PP_ALIGN.CENTER)
text(s, 10.9, 2.1, 1.6, 1.3, ('96', 60, True, EMERALD), PP_ALIGN.CENTER)
arrow(s, 10.45, 2.75, 10.95, 2.75, MUTED, 3)
text(s, 9.0, 3.25, 1.6, 0.4, ('/demo/bad', 12, True, MUTED), PP_ALIGN.CENTER)
text(s, 10.9, 3.25, 1.6, 0.4, ('/demo/good', 12, True, MUTED), PP_ALIGN.CENTER)
text(s, 9.1, 4.0, 3.5, 1.5, [('+42 points', 24, True, AMETHYST), ('Real scores from the running app, computed with no LLM', 12, False, MUTED)], PP_ALIGN.CENTER)

# ---------------------------------------------------------------- 2 Training context
s = new('Training context', 'What training gave me, and what I added', notes=(
    "Training mein humne HTML, CSS, JavaScript, React, AI aur AI agents seekhe, Node.js thoda, aur MCP ke basics.\n"
    "Express, MongoDB aur JWT training mein cover nahi hue the.\n"
    "Inhe maine Claude Code ke saath AI-assisted development se seekha aur is project mein use kiya.\n"
    "Main ye openly bata raha hoon, aur har feature explain kar sakta hoon."))
card(s, 0.7, 1.95, 5.75, 4.1); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 1.95, 5.75, 0.75, EMERALD, None, 0.2)
text(s, 0.95, 1.95, 5.3, 0.75, ('Covered in training', 20, True, WHITE), anchor=MSO_ANCHOR.MIDDLE)
chips = ['HTML', 'CSS', 'JavaScript', 'React', 'AI', 'AI agents', 'Node.js (a little)', 'MCP basics']
for i, c in enumerate(chips):
    cx, cy = 0.95 + (i % 2) * 2.75, 3.05 + (i // 2) * 0.72
    boxed(s, cx, cy, 2.55, 0.55, c, color=EMERALD, fill=SOFT[EMERALD], tsize=15, dark_text=True)
card(s, 6.88, 1.95, 5.75, 4.1); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 6.88, 1.95, 5.75, 0.75, AMETHYST, None, 0.2)
text(s, 7.13, 1.95, 5.3, 0.75, ('Extended beyond training', 20, True, WHITE), anchor=MSO_ANCHOR.MIDDLE)
for i, (c, d) in enumerate([('Express', 'REST API, SSE streaming'), ('MongoDB', 'Mongoose models, indexes'), ('JWT', 'login, protected routes')]):
    boxed(s, 7.13, 3.05 + i * 0.95, 5.25, 0.78, c, d, color=AMETHYST, fill=SOFT[AMETHYST], tsize=16, ssize=12, dark_text=True)
text(s, 7.13, 5.9, 5.3, 0.1, ('', 1, False, MUTED))
shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 6.3, 11.93, 0.55, SOFT[AMBER], None, 0.3)
text(s, 0.9, 6.3, 11.5, 0.55, ('Learned with AI-assisted development (Claude Code). I can explain every feature and decision.', 14, True, '92400E'), anchor=MSO_ANCHOR.MIDDLE)

# ---------------------------------------------------------------- 3 Problem -> Solution
s = new('Problem to solution', 'From scattered checks to one clear answer', notes=(
    "Problem ye hai ki website quality ke liye alag alag tools chalane padte hain: SEO, accessibility, security, performance.\n"
    "Aur report mein sirf raw data hota hai, ye samajh nahi aata ki pehle kya fix karein.\n"
    "AuditPilot URL leta hai, 29 checks chalata hai, score aur evidence deta hai.\n"
    "Phir local AI batata hai ki kya pehle fix karna hai, aur aap follow-up sawal bhi puch sakte ho."))
card(s, 0.7, 1.95, 5.2, 4.7); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 1.95, 0.12, 4.7, RUBY, None, 0.5)
text(s, 1.1, 2.15, 4.6, 0.5, ('The problem', 22, True, RUBY))
text(s, 1.1, 2.9, 4.6, 3.5, [('Quality checks are manual', 21, True, INK), ('A different tool for SEO, accessibility, security and speed.', 16, False, MUTED),
    ('Reports are raw data', 21, True, INK), ('Hundreds of lines, no clear priority.', 16, False, MUTED),
    ('Cloud AI is not always allowed', 21, True, INK), ('Site data may be private.', 16, False, MUTED)], spacing=1.05)
arrow(s, 6.0, 4.3, 7.0, 4.3, FUCHSIA, 4)
card(s, 7.1, 1.95, 5.53, 4.7); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 7.1, 1.95, 0.12, 4.7, EMERALD, None, 0.5)
text(s, 7.5, 2.15, 5.0, 0.5, ('AuditPilot', 22, True, EMERALD))
text(s, 7.5, 2.9, 5.0, 3.5, [('One URL, 29 checks', 21, True, INK), ('Scores and evidence in milliseconds.', 16, False, MUTED),
    ('A local AI explains', 21, True, INK), ('Summary, fix plan and chat on your laptop.', 16, False, MUTED),
    ('Compare before and after', 21, True, INK), ('See exactly which issues were fixed.', 16, False, MUTED)], spacing=1.05)

# ---------------------------------------------------------------- 4 Tech stack
s = new('Tech stack', 'Every piece has a reason', notes=(
    "Frontend React 19 aur Vite hai, charts ke liye Recharts.\n"
    "Backend Express 5 hai, MongoDB Mongoose ke saath, login ke liye JWT aur bcrypt.\n"
    "AI ke liye Ollama par open-source model qwen2.5:3b chalta hai: private, free, aur offline kaam karta hai.\n"
    "MCP SDK se same tools Claude Code mein bhi chalte hain, aur Vitest se 71 tests likhe hain."))
tiles = [('React 19 + Vite', 'fast component UI', AMETHYST), ('Express 5', 'REST API and SSE streaming', FUCHSIA), ('MongoDB + Mongoose', 'nested audit documents', EMERALD),
         ('JWT + bcrypt', 'stateless login, hashed passwords', SAPPHIRE), ('cheerio + zod', 'HTML parsing, input validation', AMBER), ('Recharts', 'score trend and charts', RUBY),
         ('MCP SDK', 'same tools in Claude Code', SAPPHIRE), ('Vitest + supertest', '71 automated tests', EMERALD)]
for i, (a, b, col) in enumerate(tiles):
    x, y = 0.7 + (i % 4) * 3.0, 1.95 + (i // 4) * 1.55
    card(s, x, y, 2.85, 1.4); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 2.85, 0.12, col, None, 0.5)
    text(s, x + 0.1, y + 0.28, 2.65, 1.0, [(a, 16, True, INK), (b, 12, False, MUTED)], PP_ALIGN.LEFT)
shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 5.1, 11.93, 1.7, AMETHYST, None, 0.08)
shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 5.1, 11.93, 1.7, None, None, 0.08)
g = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 5.1, 11.93, 1.7, AMETHYST, None, 0.08)
g.fill.gradient(); g.fill.gradient_angle = 0; g.fill.gradient_stops[0].color.rgb = C('5B21B6'); g.fill.gradient_stops[1].color.rgb = C('C026D3')
text(s, 1.0, 5.2, 5.6, 1.5, [('Ollama + qwen2.5:3b', 24, True, WHITE), ('Open-source LLM running locally', 14, False, 'F5D0FE')], anchor=MSO_ANCHOR.MIDDLE)
for i, w in enumerate(['Private', 'Free', 'Offline']):
    boxed(s, 7.0 + i * 1.9, 5.62, 1.75, 0.65, w, color=WHITE, fill='FFFFFF', tsize=16, dark_text=True)

# ---------------------------------------------------------------- 5 Architecture
s = new('System architecture', 'Two paths: facts first, AI second', notes=(
    "Ye architecture hai. Browser mein React UI Express API se baat karta hai.\n"
    "Hari line deterministic path hai: Express audit engine ko call karta hai, jo SSRF guard ke saath target website fetch karta hai. Isme LLM nahi hai.\n"
    "Orange line AI path hai: agent loop queue ke through local Ollama model se baat karta hai.\n"
    "Same tool registry MCP server ke through Claude Code ko bhi milti hai, aur sab data MongoDB mein save hota hai."))
C1, C2, C3, C4 = 0.7, 3.45, 6.45, 9.9
boxed(s, C1, 3.55, 2.2, 1.0, 'React UI', 'Vite, Recharts', AMETHYST)
boxed(s, C2, 3.55, 2.55, 1.0, 'Express API', 'auth, audits, chat (SSE)', FUCHSIA)
boxed(s, C2, 1.85, 2.55, 0.95, 'MongoDB', 'users, audits, chat', SAPPHIRE)
boxed(s, C3, 1.85, 2.95, 0.95, 'Audit engine', '29 checks + scoring', EMERALD)
boxed(s, C4, 1.85, 2.7, 0.95, 'Target website', 'SSRF-guarded fetch', '6B6788')
boxed(s, C3, 3.55, 2.95, 1.0, 'Agent loop', 'max 5 steps, zod-validated', AMBER)
boxed(s, C4, 3.55, 2.7, 1.0, 'Ollama LLM', 'qwen2.5:3b via queue', RUBY)
boxed(s, C3, 5.25, 2.95, 0.95, 'Tool registry', '5 tools, one source', AMBER, dark_text=False)
boxed(s, C2, 5.25, 2.55, 0.95, 'MCP server', 'stdio', SAPPHIRE)
boxed(s, C1, 5.25, 2.2, 0.95, 'Claude Code', 'or Claude Desktop', '6B6788')
arrow(s, 2.9, 4.05, 3.45, 4.05, INK)
arrow(s, 5.1, 3.55, 5.1, 2.8, SAPPHIRE)
arrow(s, 6.0, 3.7, 6.45, 2.5, EMERALD, 3)
arrow(s, 9.4, 2.32, 9.9, 2.32, EMERALD, 3)
arrow(s, 6.0, 4.05, 6.45, 4.05, AMBER, 3)
arrow(s, 9.4, 4.05, 9.9, 4.05, AMBER, 3)
arrow(s, 7.9, 4.55, 7.9, 5.25, AMBER, 3)
arrow(s, 2.9, 5.72, 3.45, 5.72, MUTED)
arrow(s, 6.0, 5.72, 6.45, 5.72, MUTED)
shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.7, 6.5, 0.3, 0.14, EMERALD, None, 0.5); text(s, 1.05, 6.4, 4.2, 0.35, ('Deterministic path: no LLM involved', 12, False, INK))
shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 5.4, 6.5, 0.3, 0.14, AMBER, None, 0.5); text(s, 5.75, 6.4, 4.4, 0.35, ('AI path: local, optional, queued', 12, False, INK))

# ---------------------------------------------------------------- 6 Agent loop
s = new('How the agent works', 'Tools compute the facts. The LLM only explains.', notes=(
    "Core principle ye hai: tools facts compute karte hain, LLM sirf explain karta hai.\n"
    "Chat mein current audit ka data pehle se prompt mein hota hai, to zyada sawal bina tool ke solve ho jaate hain.\n"
    "Agar zarurat ho to model tool maangta hai, server zod se arguments validate karke tool chalata hai, aur result wapas model ko deta hai.\n"
    "Guardrails: maximum 5 steps, galat arguments par ek retry, user sirf apne audits dekh sakta hai, aur ek time par ek hi LLM call."))
boxed(s, 0.7, 2.0, 2.3, 1.0, 'Your question', 'plus audit data preloaded', AMETHYST)
boxed(s, 3.6, 2.0, 2.3, 1.0, 'Local LLM', 'qwen2.5:3b, temp 0.1', RUBY)
d = shape(s, MSO_SHAPE.DIAMOND, 6.5, 1.85, 2.1, 1.3, AMBER, None)
text(s, 6.5, 1.85, 2.1, 1.3, ('Tool needed?', 14, True, WHITE), PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
boxed(s, 9.4, 2.0, 3.2, 1.0, 'Streamed answer', 'tokens arrive live (SSE)', EMERALD)
boxed(s, 6.2, 4.0, 2.7, 1.0, 'Run tool', 'zod-validated arguments', AMBER)
boxed(s, 3.0, 4.0, 2.7, 1.0, 'Result to LLM', 'name, args, ms saved as trace', FUCHSIA)
arrow(s, 3.0, 2.5, 3.6, 2.5, INK); arrow(s, 5.9, 2.5, 6.5, 2.5, INK); arrow(s, 8.6, 2.5, 9.4, 2.5, EMERALD, 3)
text(s, 8.55, 2.0, 0.9, 0.35, ('no', 12, True, EMERALD), PP_ALIGN.CENTER)
arrow(s, 7.55, 3.15, 7.55, 4.0, AMBER, 3); text(s, 7.65, 3.4, 0.8, 0.35, ('yes', 12, True, AMBER))
arrow(s, 6.2, 4.5, 5.7, 4.5, AMBER, 3); arrow(s, 4.35, 4.0, 4.75, 3.0, FUCHSIA, 3)
text(s, 0.7, 3.45, 2.5, 0.35, ('Max 5 steps per question', 12, False, MUTED))
text(s, 0.7, 5.45, 6, 0.4, ('GUARDRAILS', 12, True, FUCHSIA))
rails = [('Max 5 steps', AMETHYST), ('Bad args: retry once', AMBER), ('Own audits only', EMERALD), ('SSRF-guarded run_audit', RUBY), ('1 LLM call at a time', SAPPHIRE), ('Rate limits', FUCHSIA)]
for i, (r, col) in enumerate(rails):
    boxed(s, 0.7 + (i % 3) * 4.0, 5.85 + (i // 3) * 0.5, 3.8, 0.4, r, color=col, fill=SOFT[col], tsize=12.5, dark_text=True)

# ---------------------------------------------------------------- 7 ER diagram
s = new('Database design', 'Three collections, one nested document', notes=(
    "Database MongoDB mein hai. Do collections hain: User aur Audit.\n"
    "Ek user ke bahut saare audits hote hain, aur Audit mein user ka reference hai. Index user, url aur createdAt par hai.\n"
    "Findings, chat messages aur tool calls Audit document ke andar embedded hain, isliye ek query mein poori report mil jaati hai.\n"
    "Mongoose models: User aur Audit, baaki sub-schemas hain."))
def entity(x, y, w, h, name, fields, col):
    card(s, x, y, w, h); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, 0.5, col, None, 0.25)
    text(s, x + 0.1, y, w - 0.2, 0.5, (name, 15, True, WHITE), anchor=MSO_ANCHOR.MIDDLE)
    text(s, x + 0.12, y + 0.58, w - 0.2, h - 0.6, [(f, 11.5, False, INK) for f in fields], spacing=0.95)
entity(0.7, 2.0, 2.9, 1.9, 'User', ['_id', 'name', 'email (unique)', 'passwordHash (bcrypt)'], AMETHYST)
entity(4.6, 1.95, 3.6, 4.5, 'Audit', ['_id', 'user  ->  User', 'url, finalUrl, status', 'scores {overall, seo, accessibility,', '            security, performance}', 'summary, fixPlan', 'aiStatus: pending|ready|skipped|failed', 'llm {provider, model, mock}', 'durationMs, createdAt', 'index (user, url, createdAt)'], FUCHSIA)
entity(9.3, 1.95, 3.33, 1.85, 'Finding (embedded, 29)', ['id, category, severity', 'title, evidence', 'recommendation'], EMERALD)
entity(9.3, 4.35, 3.33, 1.5, 'ChatMessage (embedded)', ['role, content, note', 'toolCalls[]'], AMBER)
entity(4.6, 6.55, 0.01, 0.01, '', [], WHITE) if False else None
card(s, 9.3, 6.05, 3.33, 0.75, SOFT[RUBY], None); text(s, 9.4, 6.05, 3.1, 0.75, [('ToolCall: name, args, resultSummary, ms', 11.5, True, '9F1239')], anchor=MSO_ANCHOR.MIDDLE)
arrow(s, 3.6, 2.9, 4.6, 2.9, INK, 2.5); text(s, 3.55, 2.45, 1.1, 0.35, ('1 : many', 11, True, MUTED), PP_ALIGN.CENTER)
arrow(s, 8.2, 2.9, 9.3, 2.9, EMERALD, 2.5); text(s, 8.15, 2.45, 1.2, 0.35, ('embeds', 11, True, MUTED), PP_ALIGN.CENTER)
arrow(s, 8.2, 4.9, 9.3, 4.9, AMBER, 2.5); text(s, 8.15, 4.45, 1.2, 0.35, ('embeds', 11, True, MUTED), PP_ALIGN.CENTER)
arrow(s, 10.95, 5.85, 10.95, 6.05, RUBY, 2.5)

# ---------------------------------------------------------------- 8 Features (real screenshots)
s = new('Features', 'The running app, real screenshots', notes=(
    "Ye saare screenshots running app se Playwright se liye hain, asli local model qwen2.5:3b ke saath. Koi mock ya seeded text inme nahi hai.\n"
    "Pehla: animated score gauge, chaar category scores aur AI summary. Doosra: har finding mein evidence aur Nginx ya Express fix snippet.\n"
    "Teesra: agent chat, aur collapsible tool trace jisme tool ka naam, args aur time dikhta hai. Compare page agle slide par hai, 54 se 96.\n"
    "Aur bhi hai: score trend chart, Markdown export, print stylesheet, aur header mein LLM mode badge."))
imgs = [(crop('04-report-top.png', (248, 130, 2628, 1630), 'a.png'), 'Animated score gauge, category scores, AI summary written by the local model', 0.7, 1.8, 6.9, 4.35),
        (crop('05-findings-fix.png', (248, 140, 1300, 561), 'b.png'), 'Evidence and a ready fix snippet per finding', 7.85, 1.8, 4.78, 2.0),
        (crop('06-chat-tool-trace.png', (0, 545, 940, 921), 'c.png'), 'Agent chat with a collapsible tool trace', 7.85, 4.15, 4.78, 2.0)]
for p, cap, x, y, w, h in imgs:
    card(s, x, y, w, h + 0.55, WHITE, LINE, 0.03)
    s.shapes.add_picture(p, Inches(x + 0.07), Inches(y + 0.07), width=Inches(w - 0.14), height=Inches(h - 0.14))
    text(s, x + 0.1, y + h - 0.05, w - 0.2, 0.55, (cap, 12.5, True, INK), anchor=MSO_ANCHOR.MIDDLE)
text(s, 0.7, 6.76, 12, 0.3, ('Also: compare page  ·  score-trend chart  ·  Markdown export  ·  print stylesheet  ·  LLM mode badge in the header', 12, False, MUTED))

# ---------------------------------------------------------------- 9 Live demo flow
s = new('Live demo flow', 'Bad page to good page in four minutes', notes=(
    "Demo ka flow: pehle demo bad page audit karte hain, score 54 aata hai, turant, bina LLM ke.\n"
    "Findings dekhte hain, aur jab tak local model summary likhta hai, hum findings par baat karte hain. Phir agent se puchte hain: what should I fix first.\n"
    "Phir demo good page audit karte hain, score 96, aur compare page par 22 issues fixed dikhte hain. Tool trace aur MCP ka demo last mein.\n"
    "Ye numbers asli hain: laptop par CPU par model chalta hai, isliye AI answer mein 15 se 30 second lagte hain."))
steps = [('1', 'Audit demo (bad)', 'score appears instantly', RUBY), ('2', 'Read the findings', 'while AI writes summary', AMBER), ('3', 'Ask the agent', '"what should I fix first?"', FUCHSIA),
         ('4', 'Audit demo (good)', 'same page, fixed', EMERALD), ('5', 'Compare', '54 to 96, 22 issues fixed', AMETHYST), ('6', 'Tool trace + MCP', 'same tools in Claude Code', SAPPHIRE)]
for i, (n, a, b, col) in enumerate(steps):
    x = 0.7 + i * 2.0
    card(s, x, 1.95, 1.88, 2.15); shape(s, MSO_SHAPE.OVAL, x + 0.64, 2.1, 0.6, 0.6, col, None)
    text(s, x + 0.64, 2.1, 0.6, 0.6, (n, 18, True, WHITE), PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE, 0)
    text(s, x + 0.05, 2.8, 1.78, 1.3, [(a, 15, True, INK), (b, 12, False, MUTED)], PP_ALIGN.CENTER)
    if i < 5: arrow(s, x + 1.9, 3.0, x + 2.0, 3.0, MUTED, 2)
card(s, 0.7, 4.45, 7.0, 2.35, WHITE)
s.shapes.add_picture(crop('09-compare.png', (250, 300, 2630, 1090), 'd.png'), Inches(1.2), Inches(4.52), width=Inches(6.0), height=Inches(2.0))
text(s, 0.8, 6.5, 6.8, 0.3, ('Real compare page: 54 to 96 (+42)', 11, True, MUTED), PP_ALIGN.CENTER)
card(s, 8.0, 4.45, 4.63, 2.35, SOFT[AMETHYST], None)
text(s, 8.25, 4.55, 4.2, 2.2, [('Measured on this laptop', 13, True, AMETHYST), ('Audit: tens of milliseconds', 14, False, INK), ('AI summary: about 20 s (CPU)', 14, False, INK), ('Chat answer: 15 to 30 s', 14, False, INK), ('Scores never wait for the model', 14, True, INK)], spacing=1.0)

# ---------------------------------------------------------------- 10 Security and testing
s = new('Security and testing', 'Built to be safe, proven by tests', notes=(
    "Kyunki hum user ka diya URL fetch karte hain, SSRF guard zaroori hai: sirf http aur https, private aur localhost addresses block, metadata address block, max 3 redirects, 10 second timeout, 2 MB limit.\n"
    "Login JWT se hai, passwords bcrypt se hash hote hain, helmet aur rate limit lage hain, aur ek user doosre ka audit nahi dekh sakta.\n"
    "Testing mein 71 tests hain aur sab pass hote hain: 19 checker aur scoring, 21 SSRF, 10 API aur auth, 18 agent, aur 3 MCP ke.\n"
    "Asli local model ka behaviour npm run check:llm aur manual run se check kiya, CI tests se nahi."))
card(s, 0.7, 1.95, 6.2, 4.85)
text(s, 1.0, 2.05, 5.6, 0.45, ('Security layers', 20, True, AMETHYST))
sec = [('SSRF guard', 'http/https only, private + metadata IPs blocked, 3 redirects, 10 s, 2 MB', RUBY), ('JWT + bcrypt', 'protected routes, hashed passwords', SAPPHIRE),
       ('Ownership checks', "other users' audits return 404", EMERALD), ('helmet, CORS, rate limits', 'per-user limits on audits and chat', AMBER), ('zod validation', 'every input and every tool call', FUCHSIA)]
for i, (a, b, col) in enumerate(sec):
    y = 2.65 + i * 0.82
    shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 1.0, y + 0.05, 0.1, 0.6, col, None, 0.5)
    text(s, 1.25, y, 5.5, 0.75, [(a, 14.5, True, INK), (b, 11.5, False, MUTED)], spacing=0.95)
g = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 7.2, 1.95, 5.43, 2.05, AMETHYST, None, 0.07)
g.fill.gradient(); g.fill.gradient_angle = 0; g.fill.gradient_stops[0].color.rgb = C('5B21B6'); g.fill.gradient_stops[1].color.rgb = C('C026D3')
text(s, 7.2, 2.0, 5.43, 1.3, ('71 / 71', 60, True, WHITE), PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
text(s, 7.2, 3.2, 5.43, 0.6, ('tests passing  ·  npm test', 15, False, 'F5D0FE'), PP_ALIGN.CENTER)
card(s, 7.2, 4.2, 5.43, 2.6)
rows = [('Checkers + scoring + compare', '19'), ('SSRF guard', '21'), ('Auth, API, ownership', '10'), ('Agent, summary, SSE chat', '18'), ('MCP stdio client', '3')]
for i, (a, b) in enumerate(rows):
    y = 4.3 + i * 0.5
    text(s, 7.4, y, 4.2, 0.45, (a, 13, False, INK), anchor=MSO_ANCHOR.MIDDLE); text(s, 11.6, y, 0.85, 0.45, (b, 14, True, AMETHYST), PP_ALIGN.RIGHT, MSO_ANCHOR.MIDDLE)
text(s, 7.4, 6.78 - 0.02, 5.2, 0.01, ('', 1, False, MUTED))

# ---------------------------------------------------------------- 11 Learning, challenges, future
s = new('Reflection', 'What I learned, what was hard, what is next', notes=(
    "Seekha: poora MERN stack, JWT, SSRF jaise security risks, agent loop aur tool calling, MCP, aur testing.\n"
    "Challenge: chhota 3B local model kabhi tool ke arguments galat bana deta tha, jaise audit ID mangle kar dena. Maine arguments optional kiye aur helpful error diya.\n"
    "Local model CPU par slow hai, isliye summary background mein aur queue ke saath rakhi.\n"
    "Future: bada ya fine-tuned model, docs par RAG, scheduled audits, CI integration, aur zyada checks."))
cols = [('Learned', EMERALD, ['Full-stack MERN with auth', 'JWT, validation, SSRF defence', 'Agent loop and tool calling', 'MCP: one registry, two clients', 'Testing with a mock LLM']),
        ('Challenges', AMBER, ['A 3B model mangled an audit ID in a tool call: fixed with optional args and helpful errors', 'CPU LLM takes 15 to 30 s: background summary and a queue', 'Streaming with tool calls: tested on installed Ollama']),
        ('Future scope', FUCHSIA, ['Larger or fine-tuned models', 'RAG over WCAG and OWASP docs', 'Scheduled audits and alerts', 'CI integration (fail on low score)', 'More checks, JavaScript rendering'])]
for i, (h, col, items) in enumerate(cols):
    x = 0.7 + i * 4.05
    card(s, x, 1.95, 3.85, 4.85); shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, 1.95, 3.85, 0.65, col, None, 0.25)
    text(s, x + 0.2, 1.95, 3.4, 0.65, (h, 18, True, WHITE), anchor=MSO_ANCHOR.MIDDLE)
    text(s, x + 0.2, 2.8, 3.5, 3.9, [(t, 18, False, INK) for t in items], spacing=1.05)

# ---------------------------------------------------------------- 12 Thank you
s = new('', '', dark=True, notes=(
    "Dhanyavaad. AuditPilot mein tools facts nikalte hain, local open-source LLM unhe explain karta hai, aur sab kuch aapke laptop par chalta hai.\n"
    "Ab main aapke sawalon ke liye taiyaar hoon.\n"
    "Agar aap chahein to main live demo dobara dikha sakta hoon, ya koi bhi feature detail mein explain kar sakta hoon."))
text(s, 0, 2.2, 13.333, 1.5, ('Thank you', 72, True, WHITE), PP_ALIGN.CENTER)
text(s, 0, 3.9, 13.333, 0.8, ('Questions and live demo', 28, False, 'F5D0FE'), PP_ALIGN.CENTER)
text(s, 0, 5.4, 13.333, 1.0, [('Nikshey Yadav  ·  Roll No. 231302221', 18, True, WHITE), ('AuditPilot  ·  B.Tech CSE (Data Science)  ·  SGT University', 14, False, 'EDE9FE')], PP_ALIGN.CENTER)

prs.save(OUT); print('saved', OUT, len(prs.slides._sldIdLst), 'slides')
