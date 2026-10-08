// Usage:
//   node src/vault-cli.js keygen <usb-dir> [--pass]        -> writes <usb-dir>/streamvault.key, prints public key path
//   node src/vault-cli.js encrypt <spool-file>             -> used by MediaMTX hook; env REC_PUBKEY, REC_DIR
//   node src/vault-cli.js decrypt <file.sve> <out> --key <usb-dir/streamvault.key> [--pass]
import { mkdir, readFile, unlink, writeFile, chmod } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { generateKeypair, encryptFile, decryptFile } from './vault.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const a = await rl.question(q); rl.close(); return a;
}

if (cmd === 'keygen') {
  const dir = args[0];
  if (!dir) throw new Error('keygen <usb-dir> [--pass]');
  const pass = flag('--pass') ? await ask('Passphrase for key: ') : undefined;
  const { publicPem, privatePem } = generateKeypair(pass);
  await mkdir(dir, { recursive: true });
  const priv = join(dir, 'streamvault.key');
  await writeFile(priv, privatePem, { mode: 0o600, flag: 'wx' });
  await writeFile('streamvault.pub', publicPem);
  console.log(`Private key: ${priv}  <- keep ONLY on the USB stick, back it up offline`);
  console.log('Public key:  ./streamvault.pub  <- copy to the server (REC_PUBKEY)');
} else if (cmd === 'encrypt') {
  const file = args[0];
  const pub = await readFile(process.env.REC_PUBKEY);
  const outDir = process.env.REC_DIR || 'recordings';
  const rel = (process.env.MTX_PATH || 'unknown').replace(/[^a-z0-9_/-]/gi, '_').replace(/\//g, '_');
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  await encryptFile(file, pub, join(outDir, `${rel}-${basename(file)}.sve`));
  await unlink(file); // plaintext segment removed only after encrypted copy is on disk
} else if (cmd === 'decrypt') {
  const [inp, out] = args;
  const keyPath = opt('--key');
  if (!inp || !out || !keyPath) throw new Error('decrypt <file.sve> <out> --key <path> [--pass]');
  const pass = flag('--pass') ? await ask('Passphrase: ') : undefined;
  await decryptFile(inp, await readFile(keyPath), out, pass);
  console.log('Decrypted ->', out);
  await chmod(out, 0o600);
} else {
  console.error('commands: keygen | encrypt | decrypt');
  process.exit(1);
}
