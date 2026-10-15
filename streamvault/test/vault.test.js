import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, truncateSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { generateKeypair, encryptFile, decryptFile } from '../src/vault.js';

const dir = mkdtempSync(join(tmpdir(), 'sv-'));

test('roundtrip across chunk boundaries (multi-MB), ciphertext hides data', async () => {
  const { publicPem, privatePem } = generateKeypair('secret-pass');
  const data = Buffer.concat([randomBytes(2_500_000), Buffer.from('HELLO-PLAINTEXT-MARKER')]);
  const f = join(dir, 'a.ts'); writeFileSync(f, data);
  await encryptFile(f, publicPem, join(dir, 'a.sve'));
  const enc = readFileSync(join(dir, 'a.sve'));
  assert.ok(!enc.includes('HELLO-PLAINTEXT-MARKER'));
  await decryptFile(join(dir, 'a.sve'), privatePem, join(dir, 'a.out'), 'secret-pass');
  assert.ok(readFileSync(join(dir, 'a.out')).equals(data));
});

test('empty file and exact chunk size work', async () => {
  const { publicPem, privatePem } = generateKeypair();
  for (const n of [0, 1024 * 1024]) {
    const f = join(dir, `e${n}`); writeFileSync(f, randomBytes(n));
    await encryptFile(f, publicPem, `${f}.sve`);
    await decryptFile(`${f}.sve`, privatePem, `${f}.out`);
    assert.ok(readFileSync(`${f}.out`).equals(readFileSync(f)));
  }
});

test('wrong key, wrong passphrase, tampering and truncation are rejected', async () => {
  const a = generateKeypair('p1'), b = generateKeypair();
  const f = join(dir, 'b.ts'); writeFileSync(f, randomBytes(2_200_000));
  await encryptFile(f, a.publicPem, join(dir, 'b.sve'));
  const enc = join(dir, 'b.sve');
  await assert.rejects(decryptFile(enc, b.privatePem, join(dir, 'x1')));
  await assert.rejects(decryptFile(enc, a.privatePem, join(dir, 'x2'), 'bad'));
  const bad = readFileSync(enc); bad[bad.length - 100] ^= 1;
  writeFileSync(join(dir, 'tamper.sve'), bad);
  await assert.rejects(decryptFile(join(dir, 'tamper.sve'), a.privatePem, join(dir, 'x3'), 'p1'));
  // cut off whole last chunk -> must not look valid
  const full = readFileSync(enc);
  const firstLen = full.readUInt32BE(72);
  writeFileSync(join(dir, 'trunc.sve'), full.subarray(0, 72 + 4 + firstLen));
  await assert.rejects(decryptFile(join(dir, 'trunc.sve'), a.privatePem, join(dir, 'x4'), 'p1'));
  assert.ok(!existsSync(join(dir, 'x4')) && !existsSync(join(dir, 'x3')));
});

import { mkdirSync, utimesSync, readdirSync } from 'node:fs';
import { startRecorder } from '../src/recorder.js';

test('recorder encrypts idle segments, deletes plaintext, keeps fresh ones', async () => {
  const { publicPem, privatePem } = generateKeypair();
  const spool = join(dir, 'spool'), rec = join(dir, 'rec');
  mkdirSync(join(spool, 'live', 'tablet1'), { recursive: true });
  const old = join(spool, 'live', 'tablet1', 'old.ts'), fresh = join(spool, 'live', 'tablet1', 'fresh.ts');
  writeFileSync(old, 'old-data'); writeFileSync(fresh, 'fresh-data');
  const past = new Date(Date.now() - 60000); utimesSync(old, past, past);
  const r = startRecorder({ spoolDir: spool, recDir: rec, defaultDir: rec, publicPem, log: { log() {}, error() {} } });
  await r.tick(); r.stop();
  assert.ok(!existsSync(old) && existsSync(fresh));
  // stored as <rec>/YYYY-MM-DD/file.sve (one folder per day)
  const days = readdirSync(rec);
  assert.equal(days.length, 1); assert.match(days[0], /^\d{4}-\d{2}-\d{2}$/);
  const files = readdirSync(join(rec, days[0]));
  assert.equal(files.length, 1);
  await decryptFile(join(rec, days[0], files[0]), privatePem, join(dir, 'rec.out'));
  assert.equal(readFileSync(join(dir, 'rec.out'), 'utf8'), 'old-data');
});

test('recorder keeps segments in spool while the USB folder is missing, then encrypts them', async () => {
  const { publicPem } = generateKeypair();
  const spool = join(dir, 'spool2'), usb = join(dir, 'usb-later');
  mkdirSync(join(spool, 'live', 't'), { recursive: true });
  const seg = join(spool, 'live', 't', 'a.mp4'); writeFileSync(seg, 'video'); const past = new Date(Date.now() - 60000); utimesSync(seg, past, past);
  const r = startRecorder({ spoolDir: spool, recDir: () => usb, publicPem, log: { log() {}, error() {} } });
  await r.tick();
  assert.ok(existsSync(seg), 'plaintext must stay in spool, nothing written to a missing folder');
  assert.ok(!existsSync(usb), 'must not create the missing (removed USB) folder');
  mkdirSync(usb);
  await r.tick(); r.stop();
  assert.ok(!existsSync(seg)); assert.equal(readdirSync(usb).length, 1);
});
