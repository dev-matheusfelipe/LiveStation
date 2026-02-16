import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { appendMessage, readMessages } from "@/lib/chat-store";
import { findUserByEmail, updateUserPresence } from "@/lib/user-store";

type ChatBody = {
  text?: string;
};

const lastMessageByUser = new Map<string, number>();
const MIN_MESSAGE_INTERVAL_MS = 900;

function sanitizeMessage(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const messages = await readMessages();
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch (error) {
    console.error("[site/chat] invalid json", error);
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
  const text = sanitizeMessage(body.text ?? "");
  if (!text || text.length > 500) {
    return NextResponse.json({ error: "Mensagem invalida." }, { status: 400 });
  }

  const now = Date.now();
  const last = lastMessageByUser.get(session.email.toLowerCase()) ?? 0;
  if (now - last < MIN_MESSAGE_INTERVAL_MS) {
    return NextResponse.json({ error: "Envio muito rapido. Aguarde um instante." }, { status: 429 });
  }
  lastMessageByUser.set(session.email.toLowerCase(), now);

  const user = await findUserByEmail(session.email);
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  await updateUserPresence(session.email);

  const message = await appendMessage({
    userEmail: user.email,
    userName: user.username ?? user.displayName ?? user.email.split("@")[0] ?? user.email,
    avatarDataUrl: user.avatarDataUrl ?? null,
    text
  });

  return NextResponse.json({ message });
}
