import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword, newTotpSecret, totpAt, verifyTotp, sha256 } from '../src/crypto.js';

test('TOTP matches RFC 6238 vector', () => {
  // secret "12345678901234567890" in base32
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAt(secret, 59000), '287082');
  assert.equal(verifyTotp(secret, '287082', 59000), 1);
  assert.equal(verifyTotp(secret, '000000', 59000), null);
});

async function setup() {
  const db = openDb(':memory:');
  const secret = newTotpSecret();
  db.prepare('INSERT INTO users (username,password_hash,totp_secret,role,created_at) VALUES (?,?,?,?,?)')
    .run('boss', hashPassword('correct horse battery'), secret, 'admin', Date.now());
  const server = createApp({ db }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  return { db, secret, server, call };
}

test('login needs password AND totp; admin can create viewer and stream', async () => {
  const { secret, server, call } = await setup();
  try {
    assert.equal((await call('/api/me')).status, 401);
    assert.equal((await call('/api/streams')).status, 401);
    assert.equal((await call('/api/login', { method: 'POST', body: { username: 'boss', password: 'wrong' } })).status, 401);

    const s1 = await call('/api/login', { method: 'POST', body: { username: 'boss', password: 'correct horse battery' } });
    assert.equal(s1.status, 200);
    assert.equal((await call('/api/me', { cookie: s1.cookie })).status, 401); // password alone is not enough

    assert.equal((await call('/api/login/totp', { method: 'POST', body: { pending: s1.json.pending, code: '123456' } })).status, 401);
    const s2 = await call('/api/login/totp', { method: 'POST', body: { pending: s1.json.pending, code: totpAt(secret) } });
    assert.equal(s2.status, 200);
    const cookie = s2.cookie;
    assert.equal((await call('/api/me', { cookie })).json.role, 'admin');

    // create viewer + stream
    const nu = await call('/api/admin/users', { method: 'POST', cookie, body: { username: 'viewer1', password: 'long-enough-pass' } });
    assert.equal(nu.status, 200);
    assert.ok(nu.json.qr.startsWith('data:image/png'));
    const ns = await call('/api/admin/streams', { method: 'POST', cookie, body: { name: 'tablet1' } });
    assert.equal(ns.status, 200);

    // MediaMTX auth callback
    const auth = (b) => call('/internal/mediamtx/auth', { method: 'POST', body: b });
    assert.equal((await auth({ action: 'publish', path: 'live/tablet1', password: ns.json.key, ip: '1.2.3.4' })).status, 200);
    assert.equal((await auth({ action: 'publish', path: 'live/tablet1', password: 'bad', ip: '1.2.3.4' })).status, 401);
    assert.equal((await auth({ action: 'read', path: 'live/tablet1', ip: '1.2.3.4' })).status, 401);
    assert.equal((await auth({ action: 'read', path: 'live/tablet1', ip: '127.0.0.1' })).status, 200);
  } finally { server.close(); }
});

test('viewer cannot use admin API; totp code cannot be replayed', async () => {
  const { db, secret, server, call } = await setup();
  try {
    const vs = newTotpSecret();
    db.prepare('INSERT INTO users (username,password_hash,totp_secret,role,created_at) VALUES (?,?,?,?,?)')
      .run('v', hashPassword('viewer-password-1'), vs, 'viewer', Date.now());
    const p = (await call('/api/login', { method: 'POST', body: { username: 'v', password: 'viewer-password-1' } })).json.pending;
    const ok = await call('/api/login/totp', { method: 'POST', body: { pending: p, code: totpAt(vs) } });
    assert.equal(ok.status, 200);
    assert.equal((await call('/api/admin/users', { cookie: ok.cookie })).status, 403);
    // replay same code in a new login
    const p2 = (await call('/api/login', { method: 'POST', body: { username: 'v', password: 'viewer-password-1' } })).json.pending;
    assert.equal((await call('/api/login/totp', { method: 'POST', body: { pending: p2, code: totpAt(vs) } })).status, 401);
    // HLS proxy needs session
    assert.equal((await call('/hls/tablet1/index.m3u8')).status, 401);
  } finally { server.close(); }
});

test('account locks after repeated failures', async () => {
  const { server, call } = await setup();
  try {
    for (let i = 0; i < 5; i++) await call('/api/login', { method: 'POST', body: { username: 'boss', password: 'nope' } });
    const r = await call('/api/login', { method: 'POST', body: { username: 'boss', password: 'correct horse battery' } });
    assert.equal(r.status, 401);
  } finally { server.close(); }
});
