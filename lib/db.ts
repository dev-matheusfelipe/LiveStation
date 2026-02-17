import Database from "better-sqlite3";
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import os from "os";
import path from "path";

type JsonUser = {
  email: string;
  username?: string;
  passwordHash: string;
  createdAt?: string;
  displayName?: string;
  avatarDataUrl?: string | null;
  lastSeenAt?: string;
  activeVideos?: number;
  watchSeconds?: number;
};

type JsonMessage = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  text: string;
  createdAt: string;
};

const projectDataDir = path.join(process.cwd(), "data");
const tmpFallbackDataDir = path.join(os.tmpdir(), "livestation-data");
const migrationsDir = path.join(process.cwd(), "db", "migrations");

function isWritableDirectory(dirPath: string): boolean {
  try {
    mkdirSync(dirPath, { recursive: true });
    accessSync(dirPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir(): string {
  const configured = process.env.LIVESTATION_DATA_DIR ?? process.env.DATA_DIR;
  if (configured && isWritableDirectory(configured)) {
    return configured;
  }

  if (isWritableDirectory(projectDataDir)) {
    return projectDataDir;
  }

  if (isWritableDirectory(tmpFallbackDataDir)) {
    return tmpFallbackDataDir;
  }

  // Last fallback so the original error message is still surfaced by SQLite.
  return projectDataDir;
}

function listDataDirCandidates(): string[] {
  const candidates: string[] = [];
  const configured = process.env.LIVESTATION_DATA_DIR ?? process.env.DATA_DIR;
  if (configured) {
    candidates.push(configured);
  }
  candidates.push(resolveDataDir());
  candidates.push(tmpFallbackDataDir);
  candidates.push(projectDataDir);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }
  return unique;
}

let cachedDb: Database.Database | null = null;

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function migrateJsonIfNeeded(db: Database.Database, dataDir: string): void {
  const usersSeedPath = existsSync(path.join(dataDir, "users.json"))
    ? path.join(dataDir, "users.json")
    : path.join(projectDataDir, "users.json");
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const users = safeReadJson<JsonUser[]>(usersSeedPath, []);
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users (
        email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos, watch_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const user of users) {
      const username = (user.username ?? user.displayName ?? user.email.split("@")[0] ?? user.email).toLowerCase();
      const createdAt = user.createdAt ?? new Date().toISOString();
      stmt.run(
        user.email.toLowerCase(),
        username,
        user.passwordHash,
        createdAt,
        user.displayName ?? username,
        user.avatarDataUrl ?? null,
        user.lastSeenAt ?? createdAt,
        Number.isFinite(user.activeVideos) ? Math.max(0, Math.floor(user.activeVideos as number)) : 0,
        Number.isFinite(user.watchSeconds) ? Math.max(0, Math.floor(user.watchSeconds as number)) : 0
      );
    }
  }

  const messagesSeedPath = existsSync(path.join(dataDir, "chat.json"))
    ? path.join(dataDir, "chat.json")
    : path.join(projectDataDir, "chat.json");
  const messageCount = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
  if (messageCount.count === 0) {
    const messages = safeReadJson<JsonMessage[]>(messagesSeedPath, []);
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, user_email, user_name, avatar_data_url, text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const message of messages.slice(-200)) {
      stmt.run(
        message.id,
        message.userEmail.toLowerCase(),
        message.userName,
        message.avatarDataUrl ?? null,
        message.text,
        message.createdAt
      );
    }
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  if (!existsSync(migrationsDir)) {
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  const isApplied = db.prepare("SELECT id FROM schema_migrations WHERE id = ? LIMIT 1");
  const markApplied = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");

  for (const file of files) {
    const migrationId = file;
    const applied = isApplied.get(migrationId);
    if (applied) {
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      markApplied.run(migrationId, new Date().toISOString());
    });
    tx();
  }
}

function initialize(db: Database.Database, dataDir: string): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
  runMigrations(db);
  migrateJsonIfNeeded(db, dataDir);
}

function isSqliteCantOpenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "SQLITE_CANTOPEN";
}

export function getDb(): Database.Database {
  if (cachedDb) {
    return cachedDb;
  }

  let lastError: unknown;
  for (const candidateDir of listDataDirCandidates()) {
    try {
      mkdirSync(candidateDir, { recursive: true });
      const db = new Database(path.join(candidateDir, "livestation.sqlite"));
      initialize(db, candidateDir);
      cachedDb = db;
      return db;
    } catch (error) {
      lastError = error;
      if (!isSqliteCantOpenError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to open SQLite database.");
}
