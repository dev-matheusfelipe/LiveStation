import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
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
};

type JsonMessage = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  text: string;
  createdAt: string;
};

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "livestation.sqlite");
const migrationsDir = path.join(process.cwd(), "db", "migrations");

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

function migrateJsonIfNeeded(db: Database.Database): void {
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const usersPath = path.join(dataDir, "users.json");
    const users = safeReadJson<JsonUser[]>(usersPath, []);
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users (
        email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        Number.isFinite(user.activeVideos) ? Math.max(0, Math.floor(user.activeVideos as number)) : 0
      );
    }
  }

  const messageCount = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
  if (messageCount.count === 0) {
    const messagesPath = path.join(dataDir, "chat.json");
    const messages = safeReadJson<JsonMessage[]>(messagesPath, []);
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

function initialize(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
  runMigrations(db);
  migrateJsonIfNeeded(db);
}

export function getDb(): Database.Database {
  if (cachedDb) {
    return cachedDb;
  }
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  initialize(db);
  cachedDb = db;
  return db;
}
