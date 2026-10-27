import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

const findingSchema = new mongoose.Schema({
  id: String, category: String, severity: String, title: String, evidence: String, recommendation: String,
}, { _id: false });

const toolCallSchema = new mongoose.Schema({
  name: String, args: mongoose.Schema.Types.Mixed, resultSummary: String, ms: Number, error: String,
}, { _id: false });

const chatSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, default: '' },
  toolCalls: [toolCallSchema],
  note: String,
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const auditSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  url: { type: String, required: true },
  finalUrl: String,
  status: { type: String, enum: ['done', 'failed'], default: 'done' },
  rendered: { type: Boolean, default: false }, // DOM evaluated after JavaScript ran (headless browser)
  scores: { overall: Number, seo: Number, accessibility: Number, security: Number, performance: Number },
  findings: [findingSchema],
  summary: { type: String, default: '' },
  fixPlan: { type: String, default: '' },
  aiStatus: { type: String, enum: ['pending', 'ready', 'skipped', 'failed'], default: 'skipped' },
  aiError: String,
  seeded: { type: Boolean, default: false }, // true when summary text is pre-written sample data
  llm: { provider: String, model: String, mock: Boolean },
  durationMs: Number,
  chat: [chatSchema],
}, { timestamps: true });
auditSchema.index({ user: 1, url: 1, createdAt: -1 });

const scheduleSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  url: { type: String, required: true },
  everyHours: { type: Number, required: true, min: 1, max: 168 },
  render: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  nextRunAt: { type: Date, required: true, index: true },
  lastRunAt: Date, lastAuditId: mongoose.Schema.Types.ObjectId, lastError: String,
}, { timestamps: true });

export const Schedule = mongoose.models.Schedule || mongoose.model('Schedule', scheduleSchema);
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Audit = mongoose.models.Audit || mongoose.model('Audit', auditSchema);
