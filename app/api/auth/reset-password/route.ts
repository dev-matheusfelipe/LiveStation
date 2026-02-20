import { NextResponse } from "next/server";
import { hasSameOrigin, hashPassword, isStrongPassword, verifyResetPasswordToken } from "@/lib/auth";
import { updateUserPassword } from "@/lib/user-store";

type ResetPasswordBody = {
  token?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ error: "Origem invalida.", code: "AUTH_RESET_ORIGIN_INVALID" }, { status: 403 });
    }

    const body = (await request.json()) as ResetPasswordBody;
    const token = body.token?.trim() ?? "";
    const password = body.password ?? "";
    if (!token || !password) {
      return NextResponse.json({ error: "Token e senha sao obrigatorios.", code: "AUTH_RESET_MISSING_FIELDS" }, { status: 400 });
    }
    if (!isStrongPassword(password)) {
      return NextResponse.json(
        { error: "Senha deve ter 8+ caracteres com letras e numeros.", code: "AUTH_RESET_WEAK_PASSWORD" },
        { status: 400 }
      );
    }

    const payload = verifyResetPasswordToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Link invalido ou expirado.", code: "AUTH_RESET_TOKEN_INVALID" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await updateUserPassword(payload.email, passwordHash);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "Conta nao encontrada.", code: "AUTH_RESET_ACCOUNT_NOT_FOUND" }, { status: 404 });
    }
    console.error("[auth/reset-password] unexpected error", error);
    return NextResponse.json({ error: "Falha ao redefinir senha.", code: "AUTH_RESET_UNEXPECTED" }, { status: 500 });
  }
}

