import express from 'express';
import QRCode from 'qrcode';
import { Readable } from 'node:stream';
import { readdir, stat, unlink, mkdir, writeFile, readFile, statfs } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hashPassword, verifyPassword, randomToken, sha256, safeEqual,
  newTotpSecret, verifyTotp, otpauthUri,
} from './crypto.js';

const SESSION_TTL = 12 * 3600 * 1000;
const PENDING_TTL = 5 * 60 * 1000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const NAME_RE = /^[a-z0-9_-]{1,32}$/;
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const OVERLAY_DEFAULT = {
  title: 'Ахмат Запад', showTitle: true, titlePos: 'tr',
  showTimer: true, timerPos: 'tl',
  showFrame: true, frameColor: '#3b82f6', frameWidth: 4,
  aspect: 'auto',
};
const ASPECTS = ['auto', '16:9', '4:3', '1:1', '3:4', '9:16'];
const THEME_DEFAULT = { bgVersion: 0, bgExt: '', dim: 0.55, blur: 0 };
const IMG_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function imageExt(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
const POS = ['tl', 'tr', 'bl', 'br'];

function sanitizeOverlay(i = {}) {
  const o = {};
  if (typeof i.title === 'string') o.title = i.title.trim().slice(0, 40);
  for (const k of ['showTitle', 'showTimer', 'showFrame']) if (typeof i[k] === 'boolean') o[k] = i[k];
  for (const k of ['titlePos', 'timerPos']) if (POS.includes(i[k])) o[k] = i[k];
  if (/^#[0-9a-fA-F]{6}$/.test(String(i.frameColor))) o.frameColor = i.frameColor.toLowerCase();
  if ([2, 4, 8, 12].includes(i.frameWidth)) o.frameWidth = i.frameWidth;
  if (ASPECTS.includes(i.aspect)) o.aspect = i.aspect;
  return o;
}

export function createApp({ db, config = {} }) {
  const {
    mediamtxHls = 'http://127.0.0.1:8888',
    secureCookies = process.env.NODE_ENV === 'production',
    trustProxy = false,
    recDir: recDirCfg = null,
    uploadDir = null,
    shotDir = null,
  } = config;
  // recordings folder: default from config, can be changed by admin (e.g. folder on a USB stick)
  const customRecDir = () => {
    try { const row = db.prepare("SELECT value FROM settings WHERE key = 'recdir'").get(); return (row && JSON.parse(row.value).path) || null; } catch { return null; }
  };
  const defaultRecDir = typeof recDirCfg === 'function' ? recDirCfg() : recDirCfg;
  const getRecDir = () => customRecDir() || defaultRecDir;

  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=31536000',
    });
    next();
  });
  const smallJson = express.json({ limit: '10kb' });
  const bigJson = express.json({ limit: '14mb' });
  app.use((req, res, next) => (['/api/admin/background', '/api/admin/screenshots', '/api/device/screenshot'].includes(req.path) ? bigJson : smallJson)(req, res, next));

  const now = () => Date.now();
  const audit = (req, event, detail, actor) =>
    db.prepare('INSERT INTO audit (ts, actor, ip, event, detail) VALUES (?,?,?,?,?)')
      .run(now(), actor ?? req.user?.username ?? null, req.ip, event, detail ?? null);

  // ---- CSRF: state-changing requests must be JSON from same origin ----
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'forbidden' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'json required' });
    next();
  });

  // ---- per-IP rate limit for login endpoints ----
  const hits = new Map();
  const rateLimit = (max, windowMs) => (req, res, next) => {
    const key = `${req.path}|${req.ip}`;
    const t = now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    hits.set(key, arr);
    if (arr.length > max) return res.status(429).json({ error: 'too many attempts' });
    next();
  };
  setInterval(() => hits.clear(), 3600 * 1000).unref();

  // ---- sessions ----
  const cookies = (req) =>
    Object.fromEntries((req.get('cookie') || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));

  function startSession(res, userId) {
    const token = randomToken();
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha256(token), userId, now() + SESSION_TTL);
    res.cookie('sv_session', token, {
      httpOnly: true, sameSite: 'strict', secure: secureCookies, maxAge: SESSION_TTL, path: '/',
    });
  }

  function auth(req, res, next) {
    const token = cookies(req).sv_session;
    if (token) {
      const row = db.prepare(
        `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
      ).get(sha256(token), now());
      if (row) { req.user = row; return next(); }
    }
    res.status(401).json({ error: 'unauthorized' });
  }
  const adminOnly = (req, res, next) =>
    req.user.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' });

  // ---- login: step 1 (password) ----
  const pending = new Map(); // token -> {userId, exp}
  app.post('/api/login', rateLimit(10, 10 * 60 * 1000), (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'bad request' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && user && !user.disabled;
    if (user && user.locked_until > now()) {
      audit(req, 'login.locked', null, username);
      return res.status(401).json({ error: 'invalid credentials' });
    }
    if (!ok) {
      if (user) {
        const fails = user.failed_logins + 1;
        db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
          .run(fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now() + LOCK_MS : 0, user.id);
      }
      audit(req, 'login.fail', null, username);
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const p = randomToken();
    pending.set(sha256(p), { userId: user.id, exp: now() + PENDING_TTL });
    res.json({ pending: p });
  });

  // ---- login: step 2 (TOTP) ----
  app.post('/api/login/totp', rateLimit(10, 10 * 60 * 1000), (req, res) => {
    const { pending: p, code } = req.body || {};
    const key = sha256(String(p));
    const entry = pending.get(key);
    if (!entry || entry.exp < now()) { pending.delete(key); return res.status(401).json({ error: 'expired' }); }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(entry.userId);
    if (!user) { pending.delete(key); return res.status(401).json({ error: 'expired' }); }
    const step = user && !user.disabled && user.locked_until <= now() ? verifyTotp(user.totp_secret, code) : null;
    if (step === null || step <= user.last_totp_step) {
      const fails = user.failed_logins + 1;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now() + LOCK_MS : 0, user.id);
      if (fails >= LOCK_AFTER) pending.delete(key);
      audit(req, 'login.totp_fail', null, user.username);
      return res.status(401).json({ error: 'invalid code' });
    }
    pending.delete(key);
    db.prepare('UPDATE users SET last_totp_step = ?, failed_logins = 0 WHERE id = ?').run(step, user.id);
    startSession(res, user.id);
    audit(req, 'login.ok', null, user.username);
    res.json({ ok: true, role: user.role });
  });

  app.post('/api/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(cookies(req).sv_session));
    res.clearCookie('sv_session');
    res.json({ ok: true });
  });
  app.get('/api/me', auth, (req, res) => res.json({ username: req.user.username, role: req.user.role }));

  // ---- viewer: list live streams ----
  const liveSince = new Map(); // stream name -> { since, seen }: when the broadcast started / last seen live
  app.get('/api/streams', auth, async (req, res) => {
    const rows = db.prepare('SELECT name FROM streams WHERE revoked = 0 ORDER BY name').all();
    const live = await Promise.all(rows.map(async (r) => {
      try {
        const up = await fetch(`${mediamtxHls}/live/${r.name}/index.m3u8`, { signal: AbortSignal.timeout(1500) });
        await up.body?.cancel();
        return up.status === 200;
      } catch { return false; }
    }));
    const t = now();
    const streams = rows.map((r, i) => {
      const e = liveSince.get(r.name);
      if (live[i]) liveSince.set(r.name, { since: e ? e.since : t, seen: t });
      else if (e && t - e.seen > 40000) liveSince.delete(r.name); // keep the timer through short drops (the phone reconnects every 5 s)
      return { name: r.name, live: live[i], since: live[i] ? liveSince.get(r.name).since : null };
    });
    res.json({ now: t, streams });
  });

  // ---- site theme: background photo (public so the login page can use it) ----
  const getTheme = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
    try { return { ...THEME_DEFAULT, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { ...THEME_DEFAULT }; }
  };
  const saveTheme = (t) => db.prepare("INSERT INTO settings (key, value) VALUES ('theme', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(t));
  app.get('/api/theme', (req, res) => {
    const t = getTheme();
    res.json({ bg: t.bgVersion ? `/api/bg?v=${t.bgVersion}` : '/bg-default.svg', custom: !!t.bgVersion, dim: t.dim, blur: t.blur });
  });
  app.get('/api/bg', async (req, res) => {
    const t = getTheme();
    if (!uploadDir || !t.bgVersion) return res.redirect('/bg-default.svg');
    try {
      const buf = await readFile(join(uploadDir, `background.${t.bgExt}`));
      res.set({ 'Content-Type': IMG_TYPES[t.bgExt], 'Cache-Control': 'public, max-age=86400' });
      res.send(buf);
    } catch { res.redirect('/bg-default.svg'); }
  });

  // ---- overlay look (title, timer, frame): everyone reads, only admin changes ----
  const getOverlay = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'overlay'").get();
    try { return { ...OVERLAY_DEFAULT, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { ...OVERLAY_DEFAULT }; }
  };
  app.get('/api/settings', auth, (req, res) => res.json(getOverlay()));

  // ---- HLS proxy: only for logged-in users ----
  app.get('/hls/:name/:file', auth, async (req, res) => {
    const { name, file } = req.params;
    if (!NAME_RE.test(name) || !/^[\w.-]+$/.test(file) || file.includes('..')) return res.sendStatus(400);
    if (!db.prepare('SELECT 1 FROM streams WHERE name = ? AND revoked = 0').get(name)) return res.sendStatus(404);
    try {
      const qs = new URLSearchParams(req.query).toString();
      const up = await fetch(`${mediamtxHls}/live/${name}/${file}${qs ? `?${qs}` : ''}`, { signal: AbortSignal.timeout(15000) });
      if (up.status === 200) { const e = liveSince.get(name); if (e) e.seen = now(); } // someone is watching: the channel is alive
      res.status(up.status);
      for (const h of ['content-type', 'content-length']) if (up.headers.get(h)) res.set(h, up.headers.get(h));
      if (!up.body) return res.end();
      Readable.fromWeb(up.body).pipe(res);
    } catch {
      res.sendStatus(502);
    }
  });

  // ---- MediaMTX auth callback (internal, localhost only) ----
  app.post('/internal/mediamtx/auth', (req, res) => {
    const ip = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return res.sendStatus(403);
    const { action, path, password, ip: clientIp } = req.body || {};
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIp);
    if (action === 'publish') {
      const m = /^live\/([a-z0-9_-]{1,32})$/.exec(String(path));
      const row = m && db.prepare('SELECT key_hash, revoked FROM streams WHERE name = ?').get(m[1]);
      if (row && !row.revoked && typeof password === 'string' && safeEqual(sha256(password), row.key_hash)) { const prev = liveSince.get(m[1]); liveSince.set(m[1], { since: prev && now() - prev.seen < 40000 ? prev.since : now(), seen: now() }); audit(req, 'publish.ok', `${m[1]} · с адреса ${clientIp}`, null); return res.sendStatus(200); }
      audit(req, 'publish.denied', `${String(path)} · с адреса ${clientIp} · неверное имя или ключ`, null);
      return res.sendStatus(401);
    }
    // read is allowed only for our own proxy on localhost; everything else denied
    return res.sendStatus(action === 'read' && local ? 200 : 401);
  });

  // ---- admin: users ----
  const admin = express.Router();
  app.use('/api/admin', auth, adminOnly, admin);

  admin.get('/users', (req, res) => {
    res.json(db.prepare('SELECT id, username, role, disabled, created_at FROM users ORDER BY id').all());
  });

  async function enrollment(username, secret) {
    const uri = otpauthUri(secret, username);
    return { secret, uri, qr: await QRCode.toDataURL(uri) };
  }

  admin.post('/users', async (req, res) => {
    const { username, password } = req.body || {};
    if (!USER_RE.test(String(username)) || typeof password !== 'string' || password.length < 12)
      return res.status(400).json({ error: 'username 3-32 chars, password >= 12 chars' });
    const secret = newTotpSecret();
    try {
      db.prepare('INSERT INTO users (username, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?)')
        .run(username, hashPassword(password), secret, 'viewer', now());
    } catch { return res.status(409).json({ error: 'exists' }); }
    audit(req, 'user.create', username);
    res.json(await enrollment(username, secret)); // shown once
  });

  admin.post('/users/:id/reset-2fa', async (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.sendStatus(404);
    const secret = newTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ?, last_totp_step = 0 WHERE id = ?').run(secret, u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    audit(req, 'user.reset2fa', u.username);
    res.json(await enrollment(u.username, secret));
  });

  admin.post('/users/:id/password', (req, res) => {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < 12) return res.status(400).json({ error: 'password >= 12 chars' });
    const r = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.params.id);
    if (!r.changes) return res.sendStatus(404);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    audit(req, 'user.password', String(req.params.id));
    res.json({ ok: true });
  });

  admin.post('/users/:id/disable', (req, res) => {
    const disabled = req.body?.disabled ? 1 : 0;
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'cannot disable yourself' });
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled, req.params.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    audit(req, disabled ? 'user.disable' : 'user.enable', String(req.params.id));
    res.json({ ok: true });
  });

  admin.delete('/users/:id', (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'cannot delete yourself' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    audit(req, 'user.delete', String(req.params.id));
    res.json({ ok: true });
  });

  // ---- admin: streams / publish keys ----
  admin.get('/streams', (req, res) => {
    res.json(db.prepare('SELECT id, name, revoked, created_at FROM streams ORDER BY id').all());
  });

  admin.post('/streams', (req, res) => {
    const { name } = req.body || {};
    if (!NAME_RE.test(String(name))) return res.status(400).json({ error: 'name: a-z 0-9 _ - (max 32)' });
    const key = randomToken(24);
    try {
      db.prepare('INSERT INTO streams (name, key_hash, created_at) VALUES (?,?,?)').run(name, sha256(key), now());
    } catch { return res.status(409).json({ error: 'exists' }); }
    audit(req, 'stream.create', name);
    res.json({ name, key }); // key shown once
  });

  admin.delete('/streams/:id', (req, res) => {
    const row = db.prepare('SELECT name FROM streams WHERE id = ?').get(req.params.id);
    if (!row) return res.sendStatus(404);
    db.prepare('DELETE FROM streams WHERE id = ?').run(req.params.id);
    liveSince.delete(row.name);
    audit(req, 'stream.delete', row.name);
    res.json({ ok: true });
  });

  admin.post('/streams/:id/revoke', (req, res) => {
    db.prepare('UPDATE streams SET revoked = 1 WHERE id = ?').run(req.params.id);
    audit(req, 'stream.revoke', String(req.params.id));
    res.json({ ok: true });
  });

  // ---- admin: encrypted recordings, stored as <folder>/YYYY-MM-DD/file.sve (one folder per day) ----
  const DAY = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{4}/\\d{2}/\\d{2})'; // one folder per day (old year/month/day folders are still read)
  const REC_RE = new RegExp(`^(?:${DAY}/)?[\\w.-]+\\.sve$`);
  const SHOT_RE = new RegExp(`^${DAY}/[\\w.-]+\\.(png|jpg)$`);
  async function walkDated(base, re) {
    const out = [];
    const files = async (dir, rel) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (e.isFile() && re.test(rel + e.name)) { const st = await stat(join(dir, e.name)); out.push({ name: rel + e.name, size: st.size, mtime: st.mtimeMs }); }
      }
    };
    const dirs = async (dir, rx) => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && rx.test(e.name)).map((e) => e.name);
    await files(base, '');
    for (const day of await dirs(base, /^\d{4}-\d{2}-\d{2}$/)) await files(join(base, day), `${day}/`);
    for (const y of await dirs(base, /^\d{4}$/)) for (const m of await dirs(join(base, y), /^\d{2}$/)) for (const d of await dirs(join(base, y, m), /^\d{2}$/)) {
      await files(join(base, y, m, d), `${y}/${m}/${d}/`);
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  }
  admin.get('/recordings', async (req, res) => {
    const recDir = getRecDir();
    res.json(recDir ? await walkDated(recDir, REC_RE) : []);
  });
  admin.get('/recordings/file', (req, res) => {
    const recDir = getRecDir();
    const f = String(req.query.f || '');
    if (!recDir || !REC_RE.test(f)) return res.sendStatus(404);
    audit(req, 'recording.download', f);
    res.download(join(recDir, f), f.split('/').pop(), (err) => { if (err && !res.headersSent) res.sendStatus(404); });
  });

  // ---- saving a screenshot (used by the admin button and by the phone app) ----
  async function saveShot(buf, stream) {
    const ext = imageExt(buf);
    if (!shotDir || !buf.length || buf.length > 12 * 1024 * 1024 || !(ext === 'png' || ext === 'jpg')) return null;
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const dir = join(shotDir, day);
    await mkdir(dir, { recursive: true });
    const name = `${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}_${NAME_RE.test(String(stream)) ? stream : 'stream'}.${ext}`;
    await writeFile(join(dir, name), buf);
    return `${day}/${name}`;
  }

  // ---- phone app (device) API: authenticated with the stream name + stream key, the same secret used to publish ----
  const deviceAuth = (req, res, next) => {
    const { name, key } = req.body || {};
    const row = typeof name === 'string' && typeof key === 'string' && db.prepare('SELECT key_hash, revoked FROM streams WHERE name = ?').get(name);
    if (row && !row.revoked && safeEqual(sha256(key), row.key_hash)) return next();
    audit(req, 'device.denied', String(name), null);
    res.status(401).json({ error: 'invalid key' });
  };
  const deviceLimit = rateLimit(30, 60 * 1000);
  app.post('/api/device/overlay', deviceLimit, deviceAuth, (req, res) => {
    const o = getOverlay();
    res.json({ title: o.title, showTitle: o.showTitle, titlePos: o.titlePos });
  });
  app.post('/api/device/screenshot', deviceLimit, deviceAuth, async (req, res) => {
    const buf = Buffer.from(typeof req.body.data === 'string' ? req.body.data.replace(/^data:[^,]*,/, '') : '', 'base64');
    const saved = await saveShot(buf, req.body.name);
    if (!saved) return res.status(400).json({ error: 'PNG or JPG up to 12 MB' });
    audit(req, 'screenshot.device', saved, req.body.name);
    res.json({ ok: true, name: saved });
  });

  // ---- admin: screenshots of the live picture, stored as <shotDir>/YYYY-MM-DD/HH-MM-SS_channel.png ----
  admin.post('/screenshots', async (req, res) => {
    if (!shotDir) return res.status(400).json({ error: 'screenshots disabled' });
    const buf = Buffer.from(typeof req.body?.data === 'string' ? req.body.data.replace(/^data:[^,]*,/, '') : '', 'base64');
    const saved = await saveShot(buf, req.body.stream);
    if (!saved) return res.status(400).json({ error: 'PNG or JPG up to 12 MB' });
    audit(req, 'screenshot.save', saved);
    res.json({ ok: true, name: saved });
  });
  admin.get('/screenshots', async (req, res) => res.json(shotDir ? await walkDated(shotDir, SHOT_RE) : []));
  admin.get('/screenshots/file', (req, res) => {
    const f = String(req.query.f || '');
    if (!shotDir || !SHOT_RE.test(f)) return res.sendStatus(404);
    res.set({ 'Content-Type': f.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=3600' });
    if (req.query.dl) res.attachment(f.split('/').pop());
    res.sendFile(join(shotDir, f), (err) => { if (err && !res.headersSent) res.sendStatus(404); });
  });
  admin.delete('/screenshots/file', async (req, res) => {
    const f = String(req.query.f || '');
    if (!shotDir || !SHOT_RE.test(f)) return res.sendStatus(404);
    await unlink(join(shotDir, f)).catch(() => {});
    audit(req, 'screenshot.delete', f);
    res.json({ ok: true });
  });

  async function recStatus() {
    const dir = getRecDir();
    const custom = customRecDir();
    let ok = false, free = null;
    try { ok = !!dir && (await stat(dir)).isDirectory(); if (ok) { const f = await statfs(dir); free = f.bavail * f.bsize; } } catch { ok = false; }
    return { path: custom, effective: dir, custom: !!custom, ok, free };
  }
  admin.get('/recpath', async (req, res) => res.json(await recStatus()));
  admin.put('/recpath', async (req, res) => {
    const p = typeof req.body?.path === 'string' ? req.body.path.trim().replace(/^"|"$/g, '') : '';
    if (!p || p.length > 260 || !isAbsolute(p)) return res.status(400).json({ error: 'Укажите полный путь, например E:\\Ахмат Запад' });
    try {
      if (!(await stat(p)).isDirectory()) throw new Error('not a directory');
      const probe = join(p, `.write-test-${now()}`);
      await writeFile(probe, 'ok'); await unlink(probe);
    } catch { return res.status(400).json({ error: 'Папка не найдена или в неё нельзя записывать. Вставьте флешку и проверьте путь.' }); }
    db.prepare("INSERT INTO settings (key, value) VALUES ('recdir', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ path: p }));
    audit(req, 'recpath.set', p);
    res.json(await recStatus());
  });
  admin.delete('/recpath', async (req, res) => {
    db.prepare("DELETE FROM settings WHERE key = 'recdir'").run();
    audit(req, 'recpath.reset');
    res.json(await recStatus());
  });

  admin.delete('/recordings/file', async (req, res) => {
    const recDir = getRecDir();
    const f = String(req.query.f || '');
    if (!recDir || !REC_RE.test(f)) return res.sendStatus(404);
    await unlink(join(recDir, f)).catch(() => {});
    audit(req, 'recording.delete', f);
    res.json({ ok: true });
  });

  admin.put('/settings', (req, res) => {
    const next = { ...getOverlay(), ...sanitizeOverlay(req.body) };
    db.prepare("INSERT INTO settings (key, value) VALUES ('overlay', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
    audit(req, 'settings.update', JSON.stringify(sanitizeOverlay(req.body)));
    res.json(next);
  });

  admin.put('/theme', (req, res) => {
    const t = getTheme();
    const { dim, blur } = req.body || {};
    if (typeof dim === 'number' && dim >= 0 && dim <= 0.9) t.dim = dim;
    if (typeof blur === 'number' && blur >= 0 && blur <= 20) t.blur = Math.round(blur);
    saveTheme(t);
    audit(req, 'theme.update');
    res.json(t);
  });

  admin.post('/background', async (req, res) => {
    if (!uploadDir) return res.status(400).json({ error: 'uploads disabled' });
    const data = typeof req.body?.data === 'string' ? req.body.data.replace(/^data:[^,]*,/, '') : '';
    const buf = Buffer.from(data, 'base64');
    if (!buf.length || buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'image up to 10 MB' });
    const ext = imageExt(buf);
    if (!ext) return res.status(400).json({ error: 'only JPG, PNG or WEBP' });
    await mkdir(uploadDir, { recursive: true });
    const t = getTheme();
    if (t.bgExt && t.bgExt !== ext) await unlink(join(uploadDir, `background.${t.bgExt}`)).catch(() => {});
    await writeFile(join(uploadDir, `background.${ext}`), buf);
    t.bgExt = ext; t.bgVersion = now();
    saveTheme(t);
    audit(req, 'theme.background', `${ext} ${buf.length}`);
    res.json({ ok: true, bg: `/api/bg?v=${t.bgVersion}` });
  });

  admin.delete('/background', async (req, res) => {
    const t = getTheme();
    if (uploadDir && t.bgExt) await unlink(join(uploadDir, `background.${t.bgExt}`)).catch(() => {});
    t.bgExt = ''; t.bgVersion = 0;
    saveTheme(t);
    audit(req, 'theme.background.reset');
    res.json({ ok: true });
  });

  admin.get('/audit', (req, res) => {
    res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all());
  });

  // ---- static ----
  app.use('/vendor/hls.js', express.static(fileURLToPath(new URL('../node_modules/hls.js/dist/hls.min.js', import.meta.url))));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  // purge expired sessions
  setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()), 600000).unref();

  return app;
}
