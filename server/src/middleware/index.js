import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ZodError, z } from 'zod';
import { cfg } from '../config.js';
import { User } from '../models/index.js';

export class AppError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export const signToken = (userId) => jwt.sign({ sub: String(userId) }, cfg.jwtSecret, { expiresIn: '7d' });

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new AppError(401, 'Authentication required'));
  let id;
  try { id = jwt.verify(token, cfg.jwtSecret).sub; } catch { return next(new AppError(401, 'Invalid or expired token')); }
  try {
    // a valid token for a user that no longer exists (database was reset) must not look like a working session
    if (!isId(id) || !(await User.exists({ _id: id }))) return next(new AppError(401, 'Your session is no longer valid (account not found). Please sign in again.'));
  } catch (e) { return next(e); }
  req.user = { id };
  next();
}

/** Parse req[source] with a zod schema; result lands on req.valid. */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[source]);
  if (!r.success) return next(new AppError(400, 'Validation failed', z.flattenError(r.error).fieldErrors));
  req.valid = r.data;
  next();
};

export const isId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

export function notFound(req, res, next) { next(new AppError(404, `Route not found: ${req.method} ${req.path}`)); }

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return res.end();
  let status = err.status || err.statusCode || 500;
  let message = err.message;
  let details = err.details;
  if (err instanceof ZodError) { status = 400; message = 'Validation failed'; details = z.flattenError(err).fieldErrors; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }
  else if (err.code === 11000) { status = 409; message = 'Already exists'; }
  else if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (status >= 500) { console.error(err); message = 'Internal server error'; details = undefined; }
  res.status(status).json({ error: { message, code: err.code && typeof err.code === 'string' ? err.code : undefined, details } });
}
