import { openDb } from './db.js';
import { hashPassword, newTotpSecret, otpauthUri } from './crypto.js';
import QRCode from 'qrcode';

const [cmd, username, password] = process.argv.slice(2);
if (cmd !== 'create-admin' || !username || !password || password.length < 12) {
  console.error('usage: npm run create-admin -- <username> <password (>=12 chars)>');
  process.exit(1);
}
const db = openDb();
if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
  console.error('admin already exists');
  process.exit(1);
}
const secret = newTotpSecret();
db.prepare('INSERT INTO users (username, password_hash, totp_secret, role, created_at) VALUES (?,?,?,?,?)')
  .run(username, hashPassword(password), secret, 'admin', Date.now());
console.log('Admin created. Add to Authenticator (scan QR or enter secret):');
console.log(await QRCode.toString(otpauthUri(secret, username), { type: 'terminal', small: true }));
console.log('Secret:', secret);
