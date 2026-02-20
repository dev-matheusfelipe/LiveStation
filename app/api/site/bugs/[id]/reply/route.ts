import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { findBugReportById, updateBugReportReply } from "@/lib/bug-report-store";

type ReplyBody = {
  reply?: string | null;
};

const MAX_REPLY = 1500;

function sanitizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Apenas admin pode responder relatos." }, { status: 403 });
  }

  const { id } = await params;
  const current = await findBugReportById(id);
  if (!current) {
    return NextResponse.json({ error: "Relato nao encontrado." }, { status: 404 });
  }

  let body: ReplyBody;
  try {
    body = (await request.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const replyRaw = body.reply ?? null;
  let reply: string | null = null;
  if (typeof replyRaw === "string") {
    const cleaned = sanitizeText(replyRaw);
    if (cleaned.length > MAX_REPLY) {
      return NextResponse.json({ error: "Resposta muito longa." }, { status: 400 });
    }
    reply = cleaned || null;
  }

  const updated = await updateBugReportReply(id, reply);
  return NextResponse.json({ report: updated });
}

