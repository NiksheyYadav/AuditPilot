import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const fixture = (n) => fs.readFileSync(path.join(dir, '..', 'src', 'demo', n), 'utf8');

let mem;
export async function startDb() { mem = await MongoMemoryServer.create(); await mongoose.connect(mem.getUri()); }
export async function stopDb() { await mongoose.disconnect(); await mem?.stop(); }
export async function clearDb() { await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))); }

export const makeApp = (opts) => createApp(opts);

export async function register(app, name = 'Test User', email = `u${Math.random().toString(36).slice(2)}@test.dev`) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password123' });
  return { token: res.body.token, user: res.body.user, email };
}
export const authed = (app, token) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u) => request(app).post(u).set('Authorization', `Bearer ${token}`),
  delete: (u) => request(app).delete(u).set('Authorization', `Bearer ${token}`),
});

/** Start the real app on an ephemeral port so audits can fetch /demo pages over HTTP. */
export function listen(app) {
  return new Promise((resolve) => { const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve({ server: s, base: `http://127.0.0.1:${s.address().port}` })); });
}
