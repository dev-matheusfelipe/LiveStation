import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const useSsl = process.env.NODE_ENV === "production";

let cachedPool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function isPostgresEnabled(): boolean {
  return Boolean(databaseUrl);
}

export function getPgPool(): Pool {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (cachedPool) {
    return cachedPool;
  }

  cachedPool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });
  return cachedPool;
}

export async function ensurePostgresSchema(): Promise<void> {
  if (!isPostgresEnabled()) {
    return;
  }
  if (schemaReady) {
    await schemaReady;
    return;
  }

  schemaReady = (async () => {
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        display_name TEXT,
        avatar_data_url TEXT,
        last_seen_at TIMESTAMPTZ,
        active_videos INTEGER DEFAULT 0
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
    `);
  })();

  await schemaReady;
}
