// Watches the MediaMTX spool dir; every finished (idle >20 s) plaintext segment is encrypted with the
// PUBLIC key into REC_DIR and the plaintext is deleted. The server never holds the private key.
import { readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { join, basename, relative, sep } from 'node:path';
import { encryptFile } from './vault.js';

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

export function startRecorder({ spoolDir, recDir, publicPem, idleMs = 20000, intervalMs = 10000, log = console }) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await mkdir(recDir, { recursive: true, mode: 0o700 });
      for await (const f of walk(spoolDir)) {
        const st = await stat(f).catch(() => null);
        if (!st || Date.now() - st.mtimeMs < idleMs) continue;
        const tag = relative(spoolDir, f).split(sep).slice(0, -1).join('_').replace(/[^a-z0-9_-]/gi, '_');
        const out = join(recDir, `${tag}-${basename(f).replace(/[^\w.-]/g, '_')}.sve`);
        try {
          await encryptFile(f, publicPem, out);
          await unlink(f);
          log.log(`recorded+encrypted ${out}`);
        } catch (e) { log.error('encrypt failed', f, e.message); }
      }
    } finally { busy = false; }
  };
  const t = setInterval(tick, intervalMs);
  t.unref();
  return { tick, stop: () => clearInterval(t) };
}
