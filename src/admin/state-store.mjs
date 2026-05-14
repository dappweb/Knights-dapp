import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function createSqliteKvStore(databasePath) {
  ensureDirectory(databasePath);
  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );
  `);

  const getStatement = database.prepare("SELECT value, expires_at FROM kv_store WHERE key = ?");
  const putStatement = database.prepare(`
    INSERT INTO kv_store (key, value, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      expires_at = excluded.expires_at
  `);
  const deleteStatement = database.prepare("DELETE FROM kv_store WHERE key = ?");
  const deleteExpiredStatement = database.prepare(
    "DELETE FROM kv_store WHERE key = ? AND expires_at IS NOT NULL AND expires_at <= ?"
  );

  function readValue(key) {
    const row = getStatement.get(key);
    if (!row) return null;
    if (row.expires_at !== null && Number(row.expires_at) <= nowSeconds()) {
      deleteExpiredStatement.run(key, nowSeconds());
      return null;
    }
    return row.value;
  }

  return {
    async get(key, type) {
      const value = readValue(String(key));
      if (value === null) return null;
      if (type === "json") {
        try {
          return JSON.parse(value);
        } catch (_error) {
          return null;
        }
      }
      return value;
    },

    async put(key, value, options = {}) {
      const ttl = Number(options.expirationTtl || 0);
      const expiresAt = Number.isFinite(ttl) && ttl > 0 ? nowSeconds() + Math.trunc(ttl) : null;
      putStatement.run(String(key), String(value), expiresAt);
    },

    async delete(key) {
      deleteStatement.run(String(key));
    },

    async acquireLock(key, token, ttlSeconds = 180) {
      const expiresAt = nowSeconds() + Math.max(1, Math.trunc(Number(ttlSeconds) || 180));
      database.exec("BEGIN IMMEDIATE");
      try {
        const row = getStatement.get(key);
        if (row && (row.expires_at === null || Number(row.expires_at) > nowSeconds())) {
          database.exec("ROLLBACK");
          return false;
        }
        putStatement.run(key, token, expiresAt);
        database.exec("COMMIT");
        return true;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    async releaseLock(key, token) {
      const row = getStatement.get(key);
      if (row?.value === token) deleteStatement.run(key);
    },

    close() {
      database.close();
    },
  };
}
