import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/index.js';
import { AppError, requireAuth, signToken, validate } from '../middleware/index.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));
const registerSchema = z.object({ name: z.string().trim().min(2).max(60), email, password: z.string().min(8, 'Min 8 characters').max(72) });
const loginSchema = z.object({ email, password: z.string().min(1).max(72) });
const pub = (u) => ({ id: String(u._id), name: u.name, email: u.email });

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email: em, password } = req.valid;
  if (await User.exists({ email: em })) throw new AppError(409, 'An account with this email already exists');
  const user = await User.create({ name, email: em, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user._id), user: pub(user) });
});

authRouter.post('/login', validate(loginSchema), async (req, res) => {
  const user = await User.findOne({ email: req.valid.email });
  if (!user || !(await bcrypt.compare(req.valid.password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');
  res.json({ token: signToken(user._id), user: pub(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError(401, 'User no longer exists');
  res.json({ user: pub(user) });
});
