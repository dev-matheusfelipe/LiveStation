import { NextResponse } from "next/server";
import {
  createSessionToken,
  hasSameOrigin,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPassword
} from "@/lib/auth";
import { findUserByEmail } from "@/lib/user-store";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ error: "Origem invalida.", code: "AUTH_LOGIN_ORIGIN_INVALID" }, { status: 403 });
    }

    const body = (await request.json()) as LoginBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Informe e-mail e senha.", code: "AUTH_LOGIN_MISSING_FIELDS" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail invalido.", code: "AUTH_LOGIN_EMAIL_INVALID" }, { status: 400 });
    }
    if (password.length < 1 || password.length > 256) {
      return NextResponse.json({ error: "Senha invalida.", code: "AUTH_LOGIN_PASSWORD_INVALID" }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        {
          error: "Conta nao encontrada. Se acabou de cadastrar, confirme o e-mail antes de entrar.",
          code: "AUTH_LOGIN_ACCOUNT_NOT_FOUND"
        },
        { status: 404 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Credenciais invalidas.", code: "AUTH_LOGIN_CREDENTIALS_INVALID" }, { status: 401 });
    }

    const token = createSessionToken(user.email);
    const response = NextResponse.json({ ok: true, email: user.email });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS
    });
    return response;
  } catch (error) {
    console.error("[auth/login] unexpected error", error);
    return NextResponse.json({ error: "Falha ao autenticar.", code: "AUTH_LOGIN_UNEXPECTED" }, { status: 500 });
  }
}
