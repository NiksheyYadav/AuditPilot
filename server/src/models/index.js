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

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Audit = mongoose.models.Audit || mongoose.model('Audit', auditSchema);
