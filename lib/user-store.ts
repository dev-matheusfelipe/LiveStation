import { randomUUID } from "crypto";
import { hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensurePostgresSchema, getPgPool, isPostgresEnabled } from "@/lib/postgres";

export type StoredUser = {
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  displayName?: string;
  avatarDataUrl?: string | null;
  lastSeenAt?: string;
  activeVideos?: number;
  watchSeconds?: number;
};

type UserRow = {
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
  display_name: string | null;
  avatar_data_url: string | null;
  last_seen_at: string | null;
  active_videos: number | null;
  watch_seconds: number | null;
};

function normalizeRow(row: UserRow): StoredUser {
  return {
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    displayName: row.display_name ?? row.username,
    avatarDataUrl: row.avatar_data_url ?? null,
    lastSeenAt: row.last_seen_at ?? row.created_at,
    activeVideos: Number.isFinite(row.active_videos) ? (row.active_videos as number) : 0,
    watchSeconds: Number.isFinite(row.watch_seconds) ? Math.max(0, Math.floor(row.watch_seconds as number)) : 0
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeWatchIncrementSeconds(current: StoredUser, nextSeenAtIso: string, nextActiveVideos: number): number {
  const previousSeenMs = current.lastSeenAt ? new Date(current.lastSeenAt).getTime() : 0;
  const nextSeenMs = new Date(nextSeenAtIso).getTime();
  if (!Number.isFinite(previousSeenMs) || !Number.isFinite(nextSeenMs) || nextSeenMs <= previousSeenMs) {
    return 0;
  }
  if ((current.activeVideos ?? 0) <= 0 && nextActiveVideos <= 0) {
    return 0;
  }

  // Presence heartbeat runs every ~15s; clamp long gaps to avoid accidental spikes.
  const elapsedMs = Math.min(nextSeenMs - previousSeenMs, 120_000);
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

type DefaultRizzerConfig = {
  email: string;
  username: string;
  password: string;
};

let defaultRizzerEnsured = false;
let defaultRizzerEnsuring: Promise<void> | null = null;

function getDefaultRizzerConfig(): DefaultRizzerConfig | null {
  const enabledRaw = process.env.RIZZER_DEFAULT_ENABLED?.trim().toLowerCase();
  const enabled = enabledRaw ? enabledRaw !== "false" : true;
  if (!enabled) {
    return null;
  }

  const email = (process.env.RIZZER_DEFAULT_EMAIL ?? "rizzer@live-station.local").trim().toLowerCase();
  const username = (process.env.RIZZER_DEFAULT_USERNAME ?? "rizzer").trim().toLowerCase();
  const password = (process.env.RIZZER_DEFAULT_PASSWORD ?? "").trim();
  if (!email || !username || !password) {
    return null;
  }
  return { email, username, password };
}

async function ensureDefaultRizzerAccount(): Promise<void> {
  if (defaultRizzerEnsured) {
    return;
  }
  if (defaultRizzerEnsuring) {
    await defaultRizzerEnsuring;
    return;
  }

  defaultRizzerEnsuring = (async () => {
    const config = getDefaultRizzerConfig();
    if (!config) {
      defaultRizzerEnsured = true;
      return;
    }

    const passwordHash = await hashPassword(config.password);
    const now = nowIso();

    if (isPostgresEnabled()) {
      await ensurePostgresSchema();
      const pool = getPgPool();
      await pool.query(
        `
        INSERT INTO users (
          email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos, watch_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
        `,
        [config.email, config.username, passwordHash, now, "Rizzer", null, now, 0, 0]
      );
    } else {
      const db = getDb();
      db.prepare(
        `
        INSERT OR IGNORE INTO users (
          email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos, watch_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(config.email, config.username, passwordHash, now, "Rizzer", null, now, 0, 0);
    }

    defaultRizzerEnsured = true;
  })();

  await defaultRizzerEnsuring;
}

async function readUsersPostgres(): Promise<StoredUser[]> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const result = await pool.query<UserRow>("SELECT * FROM users ORDER BY created_at ASC");
  return result.rows.map(normalizeRow);
}

async function findUserByEmailPostgres(email: string): Promise<StoredUser | undefined> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [email.trim().toLowerCase()]
  );
  const row = result.rows[0];
  return row ? normalizeRow(row) : undefined;
}

async function findUserByUsernamePostgres(username: string): Promise<StoredUser | undefined> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1",
    [username.trim().toLowerCase()]
  );
  const row = result.rows[0];
  return row ? normalizeRow(row) : undefined;
}

async function createUserPostgres(email: string, passwordHash: string, username: string): Promise<StoredUser> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const emailNormalized = email.trim().toLowerCase();
  const usernameNormalized = username.trim().toLowerCase();

  const emailExists = await pool.query<{ email: string }>(
    "SELECT email FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [emailNormalized]
  );
  if (emailExists.rows.length > 0) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const usernameExists = await pool.query<{ username: string }>(
    "SELECT username FROM users WHERE lower(username) = lower($1) LIMIT 1",
    [usernameNormalized]
  );
  if (usernameExists.rows.length > 0) {
    throw new Error("USERNAME_ALREADY_EXISTS");
  }

  const now = nowIso();
  try {
    await pool.query(
      `
      INSERT INTO users (
        email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos, watch_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [emailNormalized, usernameNormalized, passwordHash, now, usernameNormalized, null, now, 0, 0]
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      const detail = String((error as { detail?: string }).detail ?? "").toLowerCase();
      const constraint = String((error as { constraint?: string }).constraint ?? "").toLowerCase();
      if (detail.includes("(email)") || constraint.includes("email")) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }
      if (detail.includes("(username)") || constraint.includes("username")) {
        throw new Error("USERNAME_ALREADY_EXISTS");
      }
    }
    throw error;
  }

  const user = await findUserByEmailPostgres(emailNormalized);
  if (!user) {
    throw new Error(`USER_CREATION_FAILED_${randomUUID()}`);
  }
  return user;
}

async function updateUserProfilePostgres(
  email: string,
  profile: { displayName?: string; avatarDataUrl?: string | null }
): Promise<StoredUser> {
  const current = await findUserByEmailPostgres(email);
  if (!current) {
    throw new Error("USER_NOT_FOUND");
  }

  const nextDisplayName =
    profile.displayName !== undefined
      ? profile.displayName.trim() || current.username
      : (current.displayName ?? current.username ?? current.email);
  const nextAvatar = profile.avatarDataUrl === undefined ? current.avatarDataUrl ?? null : profile.avatarDataUrl;

  await ensurePostgresSchema();
  const pool = getPgPool();
  await pool.query(
    `
    UPDATE users
    SET display_name = $1, avatar_data_url = $2
    WHERE lower(email) = lower($3)
    `,
    [nextDisplayName, nextAvatar, email.trim().toLowerCase()]
  );

  const updated = await findUserByEmailPostgres(email);
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return updated;
}

async function updateUserPresencePostgres(email: string, activeVideos?: number): Promise<StoredUser> {
  const current = await findUserByEmailPostgres(email);
  if (!current) {
    throw new Error("USER_NOT_FOUND");
  }

  const normalizedActiveVideos =
    typeof activeVideos === "number" && Number.isFinite(activeVideos)
      ? Math.max(0, Math.floor(activeVideos))
      : (current.activeVideos ?? 0);
  const nextSeenAt = nowIso();
  const watchIncrementSeconds = computeWatchIncrementSeconds(current, nextSeenAt, normalizedActiveVideos);
  const nextWatchSeconds = Math.max(0, Math.floor(current.watchSeconds ?? 0) + watchIncrementSeconds);

  await ensurePostgresSchema();
  const pool = getPgPool();
  await pool.query(
    `
    UPDATE users
    SET last_seen_at = $1, active_videos = $2, watch_seconds = $3
    WHERE lower(email) = lower($4)
    `,
    [nextSeenAt, normalizedActiveVideos, nextWatchSeconds, email.trim().toLowerCase()]
  );

  const updated = await findUserByEmailPostgres(email);
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return updated;
}

function readUsersSqlite(): StoredUser[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map(normalizeRow);
}

function findUserByEmailSqlite(email: string): StoredUser | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .get(email) as UserRow | undefined;
  return row ? normalizeRow(row) : undefined;
}

function findUserByUsernameSqlite(username: string): StoredUser | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?) LIMIT 1")
    .get(username) as UserRow | undefined;
  return row ? normalizeRow(row) : undefined;
}

function createUserSqlite(email: string, passwordHash: string, username: string): StoredUser {
  const db = getDb();
  const emailNormalized = email.trim().toLowerCase();
  const usernameNormalized = username.trim().toLowerCase();

  const emailExists = db.prepare("SELECT email FROM users WHERE lower(email) = lower(?) LIMIT 1").get(emailNormalized);
  if (emailExists) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const usernameExists = db
    .prepare("SELECT username FROM users WHERE lower(username) = lower(?) LIMIT 1")
    .get(usernameNormalized);
  if (usernameExists) {
    throw new Error("USERNAME_ALREADY_EXISTS");
  }

  const now = nowIso();
  try {
    db.prepare(
      `
      INSERT INTO users (
        email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos, watch_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(emailNormalized, usernameNormalized, passwordHash, now, usernameNormalized, null, now, 0, 0);
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("unique constraint failed: users.email")) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }
      if (message.includes("unique constraint failed: users.username")) {
        throw new Error("USERNAME_ALREADY_EXISTS");
      }
    }
    throw error;
  }

  const user = findUserByEmailSqlite(emailNormalized);
  if (!user) {
    throw new Error(`USER_CREATION_FAILED_${randomUUID()}`);
  }
  return user;
}

function updateUserProfileSqlite(
  email: string,
  profile: { displayName?: string; avatarDataUrl?: string | null }
): StoredUser {
  const db = getDb();
  const current = findUserByEmailSqlite(email);
  if (!current) {
    throw new Error("USER_NOT_FOUND");
  }

  const nextDisplayName =
    profile.displayName !== undefined
      ? profile.displayName.trim() || current.username
      : (current.displayName ?? current.username ?? current.email);
  const nextAvatar = profile.avatarDataUrl === undefined ? current.avatarDataUrl ?? null : profile.avatarDataUrl;

  db.prepare(
    `
    UPDATE users
    SET display_name = ?, avatar_data_url = ?
    WHERE lower(email) = lower(?)
    `
  ).run(nextDisplayName, nextAvatar, email);

  const updated = findUserByEmailSqlite(email);
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return updated;
}

function updateUserPresenceSqlite(email: string, activeVideos?: number): StoredUser {
  const current = findUserByEmailSqlite(email);
  if (!current) {
    throw new Error("USER_NOT_FOUND");
  }

  const normalizedActiveVideos =
    typeof activeVideos === "number" && Number.isFinite(activeVideos)
      ? Math.max(0, Math.floor(activeVideos))
      : (current.activeVideos ?? 0);
  const nextSeenAt = nowIso();
  const watchIncrementSeconds = computeWatchIncrementSeconds(current, nextSeenAt, normalizedActiveVideos);
  const nextWatchSeconds = Math.max(0, Math.floor(current.watchSeconds ?? 0) + watchIncrementSeconds);

  const db = getDb();
  db.prepare(
    `
    UPDATE users
    SET last_seen_at = ?, active_videos = ?, watch_seconds = ?
    WHERE lower(email) = lower(?)
    `
  ).run(nextSeenAt, normalizedActiveVideos, nextWatchSeconds, email);

  const updated = findUserByEmailSqlite(email);
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return updated;
}

export async function readUsers(): Promise<StoredUser[]> {
  await ensureDefaultRizzerAccount();
  if (isPostgresEnabled()) {
    return readUsersPostgres();
  }
  return readUsersSqlite();
}

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  await ensureDefaultRizzerAccount();
  if (isPostgresEnabled()) {
    return findUserByEmailPostgres(email);
  }
  return findUserByEmailSqlite(email);
}

export async function findUserByUsername(username: string): Promise<StoredUser | undefined> {
  await ensureDefaultRizzerAccount();
  if (isPostgresEnabled()) {
    return findUserByUsernamePostgres(username);
  }
  return findUserByUsernameSqlite(username);
}

export async function createUser(email: string, passwordHash: string, username: string): Promise<StoredUser> {
  await ensureDefaultRizzerAccount();
  if (isPostgresEnabled()) {
    return createUserPostgres(email, passwordHash, username);
  }
  return createUserSqlite(email, passwordHash, username);
}

export async function updateUserProfile(
  email: string,
  profile: { displayName?: string; avatarDataUrl?: string | null }
): Promise<StoredUser> {
  await ensureDefaultRizzerAccount();
  if (isPostgresEnabled()) {
    return updateUserProfilePostgres(email, profile);
  }
  return updateUserProfileSqlite(email, profile);
}

export async function updateUserPresence(email: string, activeVideos?: number): Promise<StoredUser> {
  await ensureDefaultRizzerAccount();
  if (isPostgresEnabled()) {
    return updateUserPresencePostgres(email, activeVideos);
  }
  return updateUserPresenceSqlite(email, activeVideos);
}
