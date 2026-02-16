import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { updateUserPresence } from "@/lib/user-store";

type PresenceBody = {
  activeVideos?: number;
};

export async function PATCH(request: Request) {
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
    const body = (await request.json()) as PresenceBody;
    await updateUserPresence(session.email, body.activeVideos);
  } catch (error) {
    console.error("[site/presence] update failed", error);
    return NextResponse.json({ error: "Falha ao atualizar presenca." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
