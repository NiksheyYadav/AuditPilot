import mongoose from 'mongoose';
import { cfg } from './config.js';

let memServer = null;

export async function connectDb(uri = cfg.mongoUri) {
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri();
    const line = '='.repeat(66);
    console.warn(`\n${line}\n  DEMO DB: MONGO_URI is empty, using in-memory MongoDB.\n  Data RESETS on every restart. Set MONGO_URI to keep your data.\n${line}\n`);
  }
  await mongoose.connect(uri);
  return uri;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memServer) { await memServer.stop(); memServer = null; }
}
