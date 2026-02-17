import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSameOrigin, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserByEmail, updateUserProfile } from "@/lib/user-store";

function unauthorized() {
  return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return unauthorized();
  }

  const user = await findUserByEmail(session.email);
  if (!user) {
    return unauthorized();
  }

  return NextResponse.json({
    email: user.email,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarDataUrl: user.avatarDataUrl ?? null,
    watchSeconds: Math.max(0, Math.floor(user.watchSeconds ?? 0))
  });
}

type ProfileBody = {
  avatarDataUrl?: string | null;
};

const MAX_AVATAR_DATA_URL_LENGTH = 8_000_000;

function isValidAvatarDataUrl(value: string): boolean {
  const normalized = value.trim();
  return normalized.startsWith("data:image/") && normalized.length <= MAX_AVATAR_DATA_URL_LENGTH;
}

export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return unauthorized();
  }

  let body: ProfileBody;
  try {
    body = (await request.json()) as ProfileBody;
  } catch (error) {
    console.error("[auth/profile] invalid json", error);
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
  const avatarDataUrl = body.avatarDataUrl;

  if (avatarDataUrl !== undefined && avatarDataUrl !== null && !isValidAvatarDataUrl(avatarDataUrl)) {
    return NextResponse.json({ error: "Imagem invalida." }, { status: 400 });
  }

  const user = await updateUserProfile(session.email, {
    avatarDataUrl: avatarDataUrl === undefined ? undefined : avatarDataUrl
  });

  return NextResponse.json({
    email: user.email,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarDataUrl: user.avatarDataUrl ?? null,
    watchSeconds: Math.max(0, Math.floor(user.watchSeconds ?? 0))
  });
}
