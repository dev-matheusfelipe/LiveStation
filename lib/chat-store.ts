import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { getDb } from "@/lib/db";

export type ChatMessage = {
  id: string;
  userEmail: string;
  userName: string;
  avatarDataUrl: string | null;
  text: string;
  createdAt: string;
};

type MessageRow = {
  id: string;
  user_email: string;
  user_name: string;
  avatar_data_url: string | null;
  text: string;
  created_at: string;
};

const MAX_MESSAGES = 200;
const chatEvents = new EventEmitter();

function normalizeMessageRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    userEmail: row.user_email,
    userName: row.user_name,
    avatarDataUrl: row.avatar_data_url ?? null,
    text: row.text,
    createdAt: row.created_at
  };
}

function pruneMessages(db: ReturnType<typeof getDb>): void {
  db.prepare(
    `
    DELETE FROM messages
    WHERE id NOT IN (
      SELECT id FROM messages ORDER BY created_at DESC LIMIT ?
    )
  `
  ).run(MAX_MESSAGES);
}

export async function readMessages(): Promise<ChatMessage[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages ORDER BY created_at ASC LIMIT ?")
    .all(MAX_MESSAGES) as MessageRow[];
  return rows.map(normalizeMessageRow);
}

export async function appendMessage(
  message: Omit<ChatMessage, "id" | "createdAt">
): Promise<ChatMessage> {
  const db = getDb();
  const next: ChatMessage = {
    ...message,
    id: randomUUID(),
    createdAt: new Date().toISOString()
  };
  db.prepare(
    `
    INSERT INTO messages (id, user_email, user_name, avatar_data_url, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(next.id, next.userEmail.toLowerCase(), next.userName, next.avatarDataUrl ?? null, next.text, next.createdAt);
  pruneMessages(db);
  chatEvents.emit("message", next);
  return next;
}

export function subscribeChatMessages(listener: (message: ChatMessage) => void): () => void {
  chatEvents.on("message", listener);
  return () => chatEvents.off("message", listener);
}

