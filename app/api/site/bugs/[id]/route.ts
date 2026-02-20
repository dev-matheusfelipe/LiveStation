import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { BugReportType, deleteBugReport, findBugReportById, updateBugReport } from "@/lib/bug-report-store";

type UpdateBody = {
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }
  const { id } = await params;
  const current = await findBugReportById(id);
  if (!current) {
    return NextResponse.json({ error: "Relato nao encontrado." }, { status: 404 });
  }
  if (current.userEmail.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const validatedBugType = body.bugType !== undefined ? validateType(body.bugType) : undefined;
  if (body.bugType !== undefined && !validatedBugType) {
    return NextResponse.json({ error: "Tipo de bug invalido." }, { status: 400 });
  }
  const bugType: BugReportType | undefined = validatedBugType ?? undefined;

  const text = body.text !== undefined ? sanitizeText(body.text) : undefined;
  if (text !== undefined && (!text || text.length > MAX_TEXT)) {
    return NextResponse.json({ error: "Descricao invalida." }, { status: 400 });
  }

  let imageDataUrl: string | null | undefined = undefined;
  if (body.imageDataUrl !== undefined) {
    if (body.imageDataUrl !== null && !isValidImageDataUrl(body.imageDataUrl)) {
      return NextResponse.json({ error: "Imagem invalida." }, { status: 400 });
    }
    imageDataUrl = body.imageDataUrl;
  }

  const updated = await updateBugReport(id, { bugType, text, imageDataUrl });
  return NextResponse.json({ report: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }
  const { id } = await params;
  const current = await findBugReportById(id);
  if (!current) {
    return NextResponse.json({ error: "Relato nao encontrado." }, { status: 404 });
  }
  if (current.userEmail.toLowerCase() !== session.email.toLowerCase() && !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  await deleteBugReport(id);
  return NextResponse.json({ ok: true });
}
