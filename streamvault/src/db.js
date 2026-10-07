import { DatabaseSync } from 'node:sqlite';

export function openDb(path = process.env.DB_PATH || 'streamvault.db') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret TEXT NOT NULL,
      last_totp_step INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
      disabled INTEGER NOT NULL DEFAULT 0,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      key_hash TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      actor TEXT,
      ip TEXT,
      event TEXT NOT NULL,
      detail TEXT
    );
  `);
  return db;
}
