import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb();
const app = createApp({
  db,
  config: {
    mediamtxHls: process.env.MEDIAMTX_HLS || 'http://127.0.0.1:8888',
    trustProxy: process.env.TRUST_PROXY === '1',
  },
});
const port = Number(process.env.PORT || 3000);
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`StreamVault on :${port}`));
