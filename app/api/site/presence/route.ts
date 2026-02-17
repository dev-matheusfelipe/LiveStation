import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { updateUserPresence } from "@/lib/user-store";

type PresenceBody = {
  activeVideos?: number;
};

async function readPresenceBody(request: Request): Promise<PresenceBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as PresenceBody;
  }
  const raw = await request.text();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as PresenceBody;
}

async function handlePresence(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  try {
    const body = await readPresenceBody(request);
    const user = await updateUserPresence(session.email, body.activeVideos);
    return NextResponse.json({ ok: true, watchSeconds: Math.max(0, Math.floor(user.watchSeconds ?? 0)) });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "Sessao invalida. Faca login novamente." }, { status: 401 });
    }
    console.error("[site/presence] update failed", error);
    return NextResponse.json({ error: "Falha ao atualizar presenca." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  return handlePresence(request);
}

export async function POST(request: Request) {
  return handlePresence(request);
}
