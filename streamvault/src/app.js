import express from 'express';
import QRCode from 'qrcode';
import { Readable } from 'node:stream';
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

export function createApp({ db, config = {} }) {
  const {
    mediamtxHls = 'http://127.0.0.1:8888',
    secureCookies = process.env.NODE_ENV === 'production',
    trustProxy = false,
  } = config;

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
  app.use(express.json({ limit: '10kb' }));

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
  app.get('/api/streams', auth, (req, res) => {
    const rows = db.prepare('SELECT name FROM streams WHERE revoked = 0 ORDER BY name').all();
    res.json(rows.map((r) => r.name));
  });

  // ---- HLS proxy: only for logged-in users ----
  app.get('/hls/:name/:file', auth, async (req, res) => {
    const { name, file } = req.params;
    if (!NAME_RE.test(name) || !/^[\w.-]+$/.test(file) || file.includes('..')) return res.sendStatus(400);
    if (!db.prepare('SELECT 1 FROM streams WHERE name = ? AND revoked = 0').get(name)) return res.sendStatus(404);
    try {
      const qs = new URLSearchParams(req.query).toString();
      const up = await fetch(`${mediamtxHls}/live/${name}/${file}${qs ? `?${qs}` : ''}`, { signal: AbortSignal.timeout(15000) });
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
      if (row && !row.revoked && typeof password === 'string' && safeEqual(sha256(password), row.key_hash)) return res.sendStatus(200);
      audit(req, 'publish.denied', String(path), null);
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

  admin.post('/streams/:id/revoke', (req, res) => {
    db.prepare('UPDATE streams SET revoked = 1 WHERE id = ?').run(req.params.id);
    audit(req, 'stream.revoke', String(req.params.id));
    res.json({ ok: true });
  });

  admin.get('/audit', (req, res) => {
    res.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all());
  });

  // ---- static ----
  app.use('/vendor/hls.js', express.static(new URL('../node_modules/hls.js/dist/hls.min.js', import.meta.url).pathname));
  app.use(express.static(new URL('../public', import.meta.url).pathname));

  // purge expired sessions
  setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()), 600000).unref();

  return app;
}
