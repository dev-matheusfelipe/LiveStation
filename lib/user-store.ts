import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";

export type StoredUser = {
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  displayName?: string;
  avatarDataUrl?: string | null;
  lastSeenAt?: string;
  activeVideos?: number;
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
    activeVideos: Number.isFinite(row.active_videos) ? (row.active_videos as number) : 0
  };
}

export async function readUsers(): Promise<StoredUser[]> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map(normalizeRow);
}

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .get(email) as UserRow | undefined;
  return row ? normalizeRow(row) : undefined;
}

export async function findUserByUsername(username: string): Promise<StoredUser | undefined> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?) LIMIT 1")
    .get(username) as UserRow | undefined;
  return row ? normalizeRow(row) : undefined;
}

export async function createUser(email: string, passwordHash: string, username: string): Promise<StoredUser> {
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

  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO users (
      email, username, password_hash, created_at, display_name, avatar_data_url, last_seen_at, active_videos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(emailNormalized, usernameNormalized, passwordHash, now, usernameNormalized, null, now, 0);

  const user = await findUserByEmail(emailNormalized);
  if (!user) {
    throw new Error(`USER_CREATION_FAILED_${randomUUID()}`);
  }
  return user;
}

export async function updateUserProfile(
  email: string,
  profile: { displayName?: string; avatarDataUrl?: string | null }
): Promise<StoredUser> {
  const db = getDb();
  const current = await findUserByEmail(email);
  if (!current) {
    throw new Error("USER_NOT_FOUND");
  }

  const nextDisplayName = current.displayName ?? current.username ?? current.email;
  const nextAvatar = profile.avatarDataUrl === undefined ? current.avatarDataUrl ?? null : profile.avatarDataUrl;

  db.prepare(
    `
    UPDATE users
    SET display_name = ?, avatar_data_url = ?
    WHERE lower(email) = lower(?)
  `
  ).run(nextDisplayName, nextAvatar, email);

  const updated = await findUserByEmail(email);
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return updated;
}

export async function updateUserPresence(email: string, activeVideos?: number): Promise<StoredUser> {
  const current = await findUserByEmail(email);
  if (!current) {
    throw new Error("USER_NOT_FOUND");
  }

  const normalizedActiveVideos =
    typeof activeVideos === "number" && Number.isFinite(activeVideos)
      ? Math.max(0, Math.floor(activeVideos))
      : (current.activeVideos ?? 0);

  const db = getDb();
  db.prepare(
    `
    UPDATE users
    SET last_seen_at = ?, active_videos = ?
    WHERE lower(email) = lower(?)
  `
  ).run(new Date().toISOString(), normalizedActiveVideos, email);

  const updated = await findUserByEmail(email);
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return updated;
}

