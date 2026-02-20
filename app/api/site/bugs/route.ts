import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { BugReportType, createBugReport, listBugReports } from "@/lib/bug-report-store";
import { findUserByEmail } from "@/lib/user-store";

type CreateBody = {
  bugType?: string;
  text?: string;
  imageDataUrl?: string | null;
};

const ALLOWED_TYPES = new Set<BugReportType>(["ui", "audio", "video", "account", "performance", "other"]);
const MAX_TEXT = 2000;
const MAX_IMAGE_DATA_URL = 8_000_000;

function sanitizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
}

function validateType(value: string): BugReportType | null {
  const normalized = value.trim().toLowerCase() as BugReportType;
  return ALLOWED_TYPES.has(normalized) ? normalized : null;
}

function isValidImageDataUrl(value: string): boolean {
  const normalized = value.trim();
  return normalized.startsWith("data:image/") && normalized.length <= MAX_IMAGE_DATA_URL;
}

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const reports = await listBugReports();
  return NextResponse.json({
    isAdmin: isAdminEmail(session.email),
    reports
  });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const bugType = validateType(body.bugType ?? "");
  if (!bugType) {
    return NextResponse.json({ error: "Tipo de bug invalido." }, { status: 400 });
  }

  const text = sanitizeText(body.text ?? "");
  if (!text || text.length > MAX_TEXT) {
    return NextResponse.json({ error: "Descricao invalida." }, { status: 400 });
  }

  let imageDataUrl: string | null = null;
  if (body.imageDataUrl !== undefined && body.imageDataUrl !== null) {
    if (!isValidImageDataUrl(body.imageDataUrl)) {
      return NextResponse.json({ error: "Imagem invalida." }, { status: 400 });
    }
    imageDataUrl = body.imageDataUrl;
  }

  const user = await findUserByEmail(session.email);
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const report = await createBugReport({
    userEmail: user.email,
    userName: user.username ?? user.displayName ?? user.email.split("@")[0] ?? user.email,
    avatarDataUrl: user.avatarDataUrl ?? null,
    bugType,
    text,
    imageDataUrl
  });

  return NextResponse.json({ report });
}

