// StreamVault для компьютера: один запуск = сервер + приём потока. Только для домашней сети.
import { createInterface } from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { networkInterfaces, platform, arch } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { generateKeypair } from '../src/vault.js';
import { startRecorder } from '../src/recorder.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
mkdirSync('data', { recursive: true });
mkdirSync('bin', { recursive: true });
process.env.DB_PATH ||= join('data', 'streamvault.db');

const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword, newTotpSecret, otpauthUri } = await import('../src/crypto.js');

// ---- 1. MediaMTX (скачивается один раз) ----
const V = 'v1.11.3';
const win = platform() === 'win32';
const exe = join('bin', win ? 'mediamtx.exe' : 'mediamtx');
if (!existsSync(exe)) {
  const target = { 'win32-x64': 'windows_amd64.zip', 'linux-x64': 'linux_amd64.tar.gz', 'linux-arm64': 'linux_arm64.tar.gz',
    'darwin-x64': 'darwin_amd64.tar.gz', 'darwin-arm64': 'darwin_arm64.tar.gz' }[`${platform()}-${arch()}`];
  if (!target) { console.error('Эта система не поддерживается автоматически. Скачайте MediaMTX вручную в папку bin/'); process.exit(1); }
  const name = `mediamtx_${V}_${target}`;
  console.log('Скачиваю MediaMTX (один раз)...');
  const r = await fetch(`https://github.com/bluenviron/mediamtx/releases/download/${V}/${name}`);
  if (!r.ok) { console.error('Не удалось скачать MediaMTX:', r.status); process.exit(1); }
  writeFileSync(join('bin', name), Buffer.from(await r.arrayBuffer()));
  const t = spawnSync('tar', ['-xf', name], { cwd: 'bin', stdio: 'inherit' }); // есть в Windows 10+, Linux, macOS
  if (t.status !== 0 || !existsSync(exe)) { console.error('Не удалось распаковать MediaMTX'); process.exit(1); }
  if (!win) chmodSync(exe, 0o755);
}

// ---- 2. Первый запуск: создать администратора ----
const db = openDb();
if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('\nПервый запуск: создаём администратора (это будете вы).');
  const username = process.env.LOCAL_ADMIN_USER || (await rl.question('Логин администратора: ')).trim();
  let password = process.env.LOCAL_ADMIN_PASS;
  while (!password || password.length < 12) password = await rl.question('Пароль (минимум 12 символов): ');
  rl.close();
  const secret = newTotpSecret();
  db.prepare('INSERT INTO users (username, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?)')
    .run(username, hashPassword(password), secret, 'admin', Date.now());
  const png = join('data', 'VAZHNO-qr-dlya-authenticator.png');
  await QRCode.toFile(png, otpauthUri(secret, username), { width: 320 });
  console.log(`\nОткройте файл ${png} и отсканируйте QR в приложении Authenticator (Google/Microsoft Authenticator).`);
  console.log(`Если не получается сканировать, введите вручную секрет: ${secret}`);
  console.log('После добавления в Authenticator удалите этот файл.\n');
}

// ---- 2b. Зашифрованная запись (по желанию): ключ — на флешке, на компьютере только публичная часть ----
const cfgPath = join('data', 'config.json');
let cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : null;
if (!cfg) {
  cfg = { record: false };
  const answer = process.env.LOCAL_KEY_DIR ?? await (async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nЗАПИСЬ ЭФИРОВ. Записи шифруются, а ключ хранится ТОЛЬКО на вашей флешке.');
    console.log('Вставьте флешку и введите её букву/путь (например E:\\ ), либо нажмите Enter, чтобы пока не записывать.');
    const a = (await rl.question('Путь к флешке: ')).trim().replace(/^"|"$/g, '');
    rl.close(); return a;
  })();
  if (answer) {
    try {
      const keyFile = join(answer, 'streamvault.key');
      if (existsSync(keyFile)) throw new Error('на флешке уже есть streamvault.key — используйте другую или удалите его');
      const { publicPem, privatePem } = generateKeypair();
      writeFileSync(keyFile, privatePem, { mode: 0o600 });
      writeFileSync(join('data', 'streamvault.pub'), publicPem);
      const folder = process.env.LOCAL_REC_FOLDER ?? await (async () => {
        const rl2 = createInterface({ input: process.stdin, output: process.stdout });
        const a2 = (await rl2.question('Папка для записей (Enter = внутри программы, data\\recordings; можно указать другой диск, например D:\\Zapisi): ')).trim().replace(/^"|"$/g, '');
        rl2.close(); return a2;
      })();
      cfg = { record: true, recDir: folder || null };
      console.log(`Ключ записан на флешку: ${keyFile}. Сделайте его копию и храните в надёжном месте!`);
      console.log('Без этого файла записи не открыть никому. С компьютера он удалён не будет — его там и не было.\n');
    } catch (e) { console.log('Запись не включена:', e.message, '\n'); }
  }
  writeFileSync(cfgPath, JSON.stringify(cfg));
}

let mtxConfig = join(root, 'deploy', 'mediamtx-local.yml');
let recDir = null;
if (cfg.record) {
  const spool = join(root, 'data', 'spool');
  recDir = cfg.recDir || join(root, 'data', 'recordings');
  mkdirSync(spool, { recursive: true });
  mtxConfig = join(root, 'data', 'mediamtx.yml');
  const rec = `pathDefaults:\n  source: publisher\n  record: yes\n  recordPath: ${spool.replace(/\\/g, '/')}/%path/%Y-%m-%d_%H-%M-%S-%f\n  recordFormat: fmp4\n  recordSegmentDuration: 10m`;
  writeFileSync(mtxConfig, readFileSync(join(root, 'deploy', 'mediamtx-local.yml'), 'utf8').replace('pathDefaults:\n  source: publisher', rec));
  startRecorder({ spoolDir: spool, recDir, publicPem: readFileSync(join(root, 'data', 'streamvault.pub')) });
  console.log('Зашифрованная запись включена.');
}

// ---- 3. Запуск ----
const mtx = spawn(join(root, exe), [mtxConfig], { cwd: join(root, 'bin'), stdio: ['ignore', 'inherit', 'inherit'] });
const stop = () => { mtx.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
mtx.on('exit', (c) => { console.error('MediaMTX остановился (код ' + c + '). Возможно, порт 1935 или 8888 занят другой программой — закройте её (или второй запуск StreamVault).'); process.exit(1); });

const port = Number(process.env.PORT || 3000);
createApp({ db, config: { secureCookies: false, recDir, uploadDir: join(root, 'data', 'uploads') } }).listen(port, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('='.repeat(60));
  console.log('Ахмат Запад запущен.');
  console.log(`  Панель на этом компьютере:   http://localhost:${port}`);
  for (const ip of ips) console.log(`  Панель с телефона в той же сети: http://${ip}:${port}`);
  console.log('  В приложении на планшете:');
  for (const ip of ips) console.log(`     Сервер: rtmp://${ip}   (имя и ключ — из админки)`);
  console.log('Остановить: Ctrl+C. Работает только в домашней сети, без шифрования.');
  console.log('='.repeat(60));
  if (!process.env.NO_OPEN) {
    const url = `http://localhost:${port}`;
    if (win) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    else spawn(platform() === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' }).on('error', () => {});
  }
});
