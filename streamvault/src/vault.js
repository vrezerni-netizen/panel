// Encrypted recordings. Server only holds the PUBLIC key; the private key lives on a USB stick.
// File format "SVE1": magic | ephemeral X25519 pubkey (SPKI DER, 44 B) | salt 16 | baseNonce 8 | chunks...
// chunk: u32 length | AES-256-GCM(ciphertext||tag). nonce = baseNonce||u32 index, AAD = final-flag byte.
import {
  generateKeyPairSync, createPublicKey, createPrivateKey, diffieHellman, hkdfSync,
  createCipheriv, createDecipheriv, randomBytes,
} from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';

const MAGIC = Buffer.from('SVE1');
const CHUNK = 1024 * 1024;
const TAG = 16;
const SPKI_LEN = 44;

export function generateKeypair(passphrase) {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privatePem: privateKey.export(
      passphrase
        ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
        : { type: 'pkcs8', format: 'pem' },
    ),
  };
}

const deriveKey = (secret, salt) => Buffer.from(hkdfSync('sha256', secret, salt, 'streamvault-sve1', 32));
const nonce = (base, i) => { const n = Buffer.alloc(12); base.copy(n); n.writeUInt32BE(i, 8); return n; };

async function readFull(fh, len, pos) {
  const buf = Buffer.alloc(len);
  let off = 0;
  while (off < len) {
    const { bytesRead } = await fh.read(buf, off, len - off, pos + off);
    if (!bytesRead) break;
    off += bytesRead;
  }
  return buf.subarray(0, off);
}

export async function encryptFile(inPath, publicPem, outPath) {
  const eph = generateKeyPairSync('x25519');
  const secret = diffieHellman({ privateKey: eph.privateKey, publicKey: createPublicKey(publicPem) });
  const salt = randomBytes(16);
  const base = randomBytes(8);
  const key = deriveKey(secret, salt);
  const tmp = `${outPath}.part`;
  const src = await open(inPath, 'r');
  const dst = await open(tmp, 'w', 0o600);
  try {
    await dst.write(Buffer.concat([MAGIC, eph.publicKey.export({ type: 'spki', format: 'der' }), salt, base]));
    const size = (await src.stat()).size;
    let pos = 0, idx = 0;
    do {
      const plain = await readFull(src, CHUNK, pos);
      pos += plain.length;
      const final = pos >= size;
      const c = createCipheriv('aes-256-gcm', key, nonce(base, idx++));
      c.setAAD(Buffer.from([final ? 1 : 0]));
      const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
      const len = Buffer.alloc(4); len.writeUInt32BE(ct.length);
      await dst.write(Buffer.concat([len, ct]));
      if (final) break;
    } while (true);
  } catch (e) {
    await dst.close(); await src.close(); await unlink(tmp).catch(() => {});
    throw e;
  }
  await dst.sync(); await dst.close(); await src.close();
  await rename(tmp, outPath);
}

export async function decryptFile(inPath, privatePem, outPath, passphrase) {
  const privateKey = createPrivateKey({ key: privatePem, passphrase });
  const src = await open(inPath, 'r');
  const dst = await open(outPath, 'w', 0o600);
  try {
    const head = await readFull(src, 4 + SPKI_LEN + 24, 0);
    if (head.length < 4 + SPKI_LEN + 24 || !head.subarray(0, 4).equals(MAGIC)) throw new Error('not an SVE1 file');
    const eph = createPublicKey({ key: head.subarray(4, 4 + SPKI_LEN), format: 'der', type: 'spki' });
    const salt = head.subarray(4 + SPKI_LEN, 4 + SPKI_LEN + 16);
    const base = head.subarray(4 + SPKI_LEN + 16);
    const key = deriveKey(diffieHellman({ privateKey, publicKey: eph }), salt);
    const size = (await src.stat()).size;
    let pos = head.length, idx = 0, sawFinal = false;
    while (pos < size) {
      const lenBuf = await readFull(src, 4, pos);
      if (lenBuf.length < 4) throw new Error('truncated');
      const len = lenBuf.readUInt32BE();
      if (len < TAG || len > CHUNK + TAG) throw new Error('corrupt chunk');
      const ct = await readFull(src, len, pos + 4);
      if (ct.length < len) throw new Error('truncated');
      pos += 4 + len;
      const final = pos >= size;
      const d = createDecipheriv('aes-256-gcm', key, nonce(base, idx++));
      d.setAAD(Buffer.from([final ? 1 : 0]));
      d.setAuthTag(ct.subarray(len - TAG));
      await dst.write(Buffer.concat([d.update(ct.subarray(0, len - TAG)), d.final()]));
      sawFinal = final;
    }
    if (!sawFinal) throw new Error('truncated');
  } catch (e) {
    await dst.close(); await src.close(); await unlink(outPath).catch(() => {});
    throw e.code === 'ERR_OSSL_BAD_DECRYPT' || /auth/i.test(e.message) ? new Error('wrong key or file tampered') : e;
  }
  await dst.close(); await src.close();
}
