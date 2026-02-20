import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  hasSameOrigin,
  hashPassword,
  isStrongPassword,
  SESSION_COOKIE,
  verifyPassword,
  verifySessionToken
} from "@/lib/auth";
import { findUserByEmail, updateUserPassword } from "@/lib/user-store";

type Body = {
  currentPassword?: string;
  newPassword?: string;
};

function unauthorized() {
  return NextResponse.json({ error: "Nao autenticado.", code: "AUTH_CHANGE_PASSWORD_UNAUTHORIZED" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) {
      return NextResponse.json(
        { error: "Origem invalida.", code: "AUTH_CHANGE_PASSWORD_ORIGIN_INVALID" },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = verifySessionToken(token);
    if (!session) {
      return unauthorized();
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Payload invalido.", code: "AUTH_CHANGE_PASSWORD_BAD_PAYLOAD" }, { status: 400 });
    }

    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Informe senha atual e nova senha.", code: "AUTH_CHANGE_PASSWORD_MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (!isStrongPassword(newPassword)) {
      return NextResponse.json(
        { error: "Nova senha fraca. Use 8+ caracteres com letras e numeros.", code: "AUTH_CHANGE_PASSWORD_WEAK" },
        { status: 400 }
      );
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "A nova senha deve ser diferente da atual.", code: "AUTH_CHANGE_PASSWORD_SAME" },
        { status: 400 }
      );
    }

    const user = await findUserByEmail(session.email);
    if (!user) {
      return unauthorized();
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Senha atual incorreta.", code: "AUTH_CHANGE_PASSWORD_CURRENT_INVALID" },
        { status: 401 }
      );
    }

    const newHash = await hashPassword(newPassword);
    await updateUserPassword(session.email, newHash);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth/change-password] unexpected error", error);
    return NextResponse.json(
      { error: "Falha ao alterar senha.", code: "AUTH_CHANGE_PASSWORD_UNEXPECTED" },
      { status: 500 }
    );
  }
}

