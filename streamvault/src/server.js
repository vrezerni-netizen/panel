import { openDb } from './db.js';
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { startRecorder } from './recorder.js';

const db = openDb();
const app = createApp({
  db,
  config: {
    mediamtxHls: process.env.MEDIAMTX_HLS || 'http://127.0.0.1:8888',
    trustProxy: process.env.TRUST_PROXY === '1',
    recDir: process.env.REC_DIR || 'recordings',
  },
});
if (process.env.REC_PUBKEY) {
  startRecorder({
    spoolDir: process.env.REC_SPOOL || 'spool',
    recDir: process.env.REC_DIR || 'recordings',
    publicPem: readFileSync(process.env.REC_PUBKEY),
  });
  console.log('Encrypted recording enabled');
}
const port = Number(process.env.PORT || 3000);
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`StreamVault on :${port}`));
