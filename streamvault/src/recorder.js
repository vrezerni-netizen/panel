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

export function startRecorder({ spoolDir, recDir, defaultDir = null, publicPem, idleMs = 20000, intervalMs = 10000, log = console }) {
  // recDir may be a function (re-read each tick: admin can point it at a USB stick). If the folder is missing
  // (stick removed), segments stay in the spool and are encrypted as soon as it is back.
  let busy = false, warned = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const dir = typeof recDir === 'function' ? recDir() : recDir;
      if (defaultDir && dir === defaultDir) await mkdir(dir, { recursive: true, mode: 0o700 });
      const okDir = await stat(dir).then((x) => x.isDirectory()).catch(() => false);
      if (!okDir) { if (!warned) log.error('Папка записей недоступна, записи ждут в spool:', dir); warned = true; return; }
      warned = false;
      for await (const f of walk(spoolDir)) {
        const st = await stat(f).catch(() => null);
        if (!st || Date.now() - st.mtimeMs < idleMs) continue;
        const tag = relative(spoolDir, f).split(sep).slice(0, -1).join('_').replace(/[^a-z0-9_-]/gi, '_');
        const out = join(dir, `${tag}-${basename(f).replace(/[^\w.-]/g, '_')}.sve`);
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
