import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { cfg } from './config.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data', 'mongo');
let memServer = null;
let persisted = false;

const banner = (lines) => {
  const bar = '='.repeat(70);
  console.warn(['', bar, ...lines.map((x) => `  ${x}`), bar, ''].join('\n'));
};

/**
 * MONGO_URI set   -> that database (e.g. Atlas).
 * MONGO_URI empty -> a local mongodb-memory-server. By default its files live in server/.data/mongo, so audits and
 * history survive API restarts (npm run dev restarts the API on every server file change). DEMO_DB_PERSIST=false
 * gives a pure in-memory DB that resets on restart.
 */
export async function connectDb(uri = cfg.mongoUri) {
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    if (cfg.persistDemoDb) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        memServer = await MongoMemoryServer.create({ instance: { dbPath: DATA_DIR, storageEngine: 'wiredTiger' } });
        persisted = true;
        banner(['DEMO DB: MONGO_URI is empty, using a local MongoDB stored in server/.data/mongo.',
          'Your audits and history SURVIVE restarts. Delete that folder to reset.',
          'Set MONGO_URI (for example Atlas) to use a hosted database.']);
      } catch (e) {
        console.warn(`[db] on-disk demo DB unavailable (${String(e.message).split('\n')[0].slice(0, 90)}); falling back to in-memory.`);
      }
    }
    if (!memServer) {
      memServer = await MongoMemoryServer.create();
      banner(['DEMO DB: MONGO_URI is empty, using in-memory MongoDB.',
        'Data RESETS on every restart. Set MONGO_URI (or DEMO_DB_PERSIST=true) to keep your data.']);
    }
    uri = memServer.getUri();
  }
  await mongoose.connect(uri);
  return uri;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memServer) { await memServer.stop({ doCleanup: !persisted }); memServer = null; }
}
