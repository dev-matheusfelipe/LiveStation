import { Pool } from "pg";

function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();

  // Accept pasted Neon snippets like: psql 'postgresql://...'
  if (trimmed.toLowerCase().startsWith("psql ")) {
    const match = trimmed.match(/['"](postgres(?:ql)?:\/\/[^'"]+)['"]/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  if (/^postgres(?:ql)?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

const databaseUrl =
  normalizeDatabaseUrl(process.env.DATABASE_URL) ??
  normalizeDatabaseUrl(process.env.POSTGRES_URL) ??
  normalizeDatabaseUrl(process.env.POSTGRES_PRISMA_URL) ??
  normalizeDatabaseUrl(process.env.NEON_DATABASE_URL);
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
        active_videos INTEGER DEFAULT 0,
        watch_seconds BIGINT DEFAULT 0
      );
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS watch_seconds BIGINT DEFAULT 0;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        avatar_data_url TEXT,
        bug_type TEXT NOT NULL,
        text TEXT NOT NULL,
        image_data_url TEXT,
        admin_reply TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bug_reports_user_email ON bug_reports(user_email);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        avatar_data_url TEXT,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
    `);
  })();

  await schemaReady;
}
