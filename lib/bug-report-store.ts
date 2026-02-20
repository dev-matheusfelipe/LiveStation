import { randomUUID } from "crypto";
import { ensurePostgresSchema, getPgPool, isPostgresEnabled } from "@/lib/postgres";
import { getDb } from "@/lib/db";

export type BugReportType = "ui" | "audio" | "video" | "account" | "performance" | "other";

export type BugReport = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  bugType: BugReportType;
  text: string;
  imageDataUrl: string | null;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
};

type BugReportRow = {
  id: string;
  user_email: string;
  user_name: string;
  avatar_data_url: string | null;
  bug_type: string;
  text: string;
  image_data_url: string | null;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
};

type CreateBugReportInput = {
  userEmail: string;
  userName: string;
  avatarDataUrl?: string | null;
  bugType: BugReportType;
  text: string;
  imageDataUrl?: string | null;
};

type UpdateBugReportInput = {
  bugType?: BugReportType;
  text?: string;
  imageDataUrl?: string | null;
};

function normalizeBugType(value: string): BugReportType {
  const v = value.trim().toLowerCase();
  if (v === "ui" || v === "audio" || v === "video" || v === "account" || v === "performance") {
    return v;
  }
  return "other";
}

function mapRow(row: BugReportRow): BugReport {
  return {
    id: row.id,
    userEmail: row.user_email,
    userName: row.user_name,
    avatarDataUrl: row.avatar_data_url ?? null,
    bugType: normalizeBugType(row.bug_type),
    text: row.text,
    imageDataUrl: row.image_data_url ?? null,
    adminReply: row.admin_reply ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listBugReportsPostgres(): Promise<BugReport[]> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const result = await pool.query<BugReportRow>("SELECT * FROM bug_reports ORDER BY created_at DESC LIMIT 200");
  return result.rows.map(mapRow);
}

function listBugReportsSqlite(): BugReport[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM bug_reports ORDER BY created_at DESC LIMIT 200").all() as BugReportRow[];
  return rows.map(mapRow);
}

async function findBugReportByIdPostgres(id: string): Promise<BugReport | null> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const result = await pool.query<BugReportRow>("SELECT * FROM bug_reports WHERE id = $1 LIMIT 1", [id]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

function findBugReportByIdSqlite(id: string): BugReport | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bug_reports WHERE id = ? LIMIT 1").get(id) as BugReportRow | undefined;
  return row ? mapRow(row) : null;
}

async function createBugReportPostgres(input: CreateBugReportInput): Promise<BugReport> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const now = new Date().toISOString();
  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO bug_reports (
        id, user_email, user_name, avatar_data_url, bug_type, text, image_data_url, admin_reply, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      id,
      input.userEmail.toLowerCase(),
      input.userName,
      input.avatarDataUrl ?? null,
      input.bugType,
      input.text,
      input.imageDataUrl ?? null,
      null,
      now,
      now
    ]
  );
  const created = await findBugReportByIdPostgres(id);
  if (!created) {
    throw new Error("BUG_REPORT_CREATE_FAILED");
  }
  return created;
}

function createBugReportSqlite(input: CreateBugReportInput): BugReport {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO bug_reports (
        id, user_email, user_name, avatar_data_url, bug_type, text, image_data_url, admin_reply, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    input.userEmail.toLowerCase(),
    input.userName,
    input.avatarDataUrl ?? null,
    input.bugType,
    input.text,
    input.imageDataUrl ?? null,
    null,
    now,
    now
  );
  const created = findBugReportByIdSqlite(id);
  if (!created) {
    throw new Error("BUG_REPORT_CREATE_FAILED");
  }
  return created;
}

async function updateBugReportPostgres(id: string, input: UpdateBugReportInput): Promise<BugReport> {
  const current = await findBugReportByIdPostgres(id);
  if (!current) {
    throw new Error("BUG_REPORT_NOT_FOUND");
  }
  const nextType = input.bugType ?? current.bugType;
  const nextText = input.text ?? current.text;
  const nextImage = input.imageDataUrl === undefined ? current.imageDataUrl : input.imageDataUrl;
  const now = new Date().toISOString();
  await ensurePostgresSchema();
  const pool = getPgPool();
  await pool.query(
    `
      UPDATE bug_reports
      SET bug_type = $1, text = $2, image_data_url = $3, updated_at = $4
      WHERE id = $5
    `,
    [nextType, nextText, nextImage, now, id]
  );
  const updated = await findBugReportByIdPostgres(id);
  if (!updated) {
    throw new Error("BUG_REPORT_NOT_FOUND");
  }
  return updated;
}

function updateBugReportSqlite(id: string, input: UpdateBugReportInput): BugReport {
  const current = findBugReportByIdSqlite(id);
  if (!current) {
    throw new Error("BUG_REPORT_NOT_FOUND");
  }
  const nextType = input.bugType ?? current.bugType;
  const nextText = input.text ?? current.text;
  const nextImage = input.imageDataUrl === undefined ? current.imageDataUrl : input.imageDataUrl;
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `
      UPDATE bug_reports
      SET bug_type = ?, text = ?, image_data_url = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(nextType, nextText, nextImage, now, id);
  const updated = findBugReportByIdSqlite(id);
  if (!updated) {
    throw new Error("BUG_REPORT_NOT_FOUND");
  }
  return updated;
}

async function updateBugReportReplyPostgres(id: string, reply: string | null): Promise<BugReport> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  const now = new Date().toISOString();
  await pool.query("UPDATE bug_reports SET admin_reply = $1, updated_at = $2 WHERE id = $3", [reply, now, id]);
  const updated = await findBugReportByIdPostgres(id);
  if (!updated) {
    throw new Error("BUG_REPORT_NOT_FOUND");
  }
  return updated;
}

function updateBugReportReplySqlite(id: string, reply: string | null): BugReport {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE bug_reports SET admin_reply = ?, updated_at = ? WHERE id = ?").run(reply, now, id);
  const updated = findBugReportByIdSqlite(id);
  if (!updated) {
    throw new Error("BUG_REPORT_NOT_FOUND");
  }
  return updated;
}

async function deleteBugReportPostgres(id: string): Promise<void> {
  await ensurePostgresSchema();
  const pool = getPgPool();
  await pool.query("DELETE FROM bug_reports WHERE id = $1", [id]);
}

function deleteBugReportSqlite(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM bug_reports WHERE id = ?").run(id);
}

export async function listBugReports(): Promise<BugReport[]> {
  if (isPostgresEnabled()) {
    return listBugReportsPostgres();
  }
  return listBugReportsSqlite();
}

export async function findBugReportById(id: string): Promise<BugReport | null> {
  if (isPostgresEnabled()) {
    return findBugReportByIdPostgres(id);
  }
  return findBugReportByIdSqlite(id);
}

export async function createBugReport(input: CreateBugReportInput): Promise<BugReport> {
  if (isPostgresEnabled()) {
    return createBugReportPostgres(input);
  }
  return createBugReportSqlite(input);
}

export async function updateBugReport(id: string, input: UpdateBugReportInput): Promise<BugReport> {
  if (isPostgresEnabled()) {
    return updateBugReportPostgres(id, input);
  }
  return updateBugReportSqlite(id, input);
}

export async function updateBugReportReply(id: string, reply: string | null): Promise<BugReport> {
  if (isPostgresEnabled()) {
    return updateBugReportReplyPostgres(id, reply);
  }
  return updateBugReportReplySqlite(id, reply);
}

export async function deleteBugReport(id: string): Promise<void> {
  if (isPostgresEnabled()) {
    return deleteBugReportPostgres(id);
  }
  return deleteBugReportSqlite(id);
}

