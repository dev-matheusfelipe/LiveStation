import { NextResponse } from "next/server";
import { createEmailVerificationToken, hasSameOrigin, hashPassword, isStrongPassword } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/mailer";
import { findUserByEmail, findUserByUsername } from "@/lib/user-store";
import { getSiteUrl } from "@/lib/site";
import { evaluateUsernamePolicy } from "@/lib/username-policy";

type RegisterBody = {
  email?: string;
  password?: string;
  username?: string;
};

function validate(email: string, password: string, username: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "E-mail invalido.";
  }
  if (!isStrongPassword(password)) {
    return "Senha deve ter 8+ caracteres com letras e numeros.";
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return "Usuario deve ter 3-20 caracteres (letras, numeros e _).";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ error: "Origem invalida.", code: "AUTH_REGISTER_ORIGIN_INVALID" }, { status: 403 });
    }

    const body = (await request.json()) as RegisterBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const username = body.username?.trim() ?? "";

    const error = validate(email, password, username);
    if (error) {
      return NextResponse.json({ error, code: "AUTH_REGISTER_VALIDATION_FAILED" }, { status: 400 });
    }

    const usernamePolicy = evaluateUsernamePolicy(username);
    if (!usernamePolicy.allowed) {
      return NextResponse.json(
        { error: "Este usuario e reservado. Escolha outro nome de usuario.", code: "AUTH_REGISTER_USERNAME_RESERVED" },
        { status: 400 }
      );
    }

    const emailExists = await findUserByEmail(email);
    if (emailExists) {
      return NextResponse.json({ error: "Este e-mail ja esta cadastrado.", code: "AUTH_REGISTER_EMAIL_EXISTS" }, { status: 409 });
    }
    const usernameExists = await findUserByUsername(username);
    if (usernameExists) {
      return NextResponse.json({ error: "Este usuario ja esta em uso.", code: "AUTH_REGISTER_USERNAME_EXISTS" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const token = createEmailVerificationToken(email, username, passwordHash);
    const verifyUrl = `${getSiteUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    await sendVerificationEmail(email, username, verifyUrl);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SMTP_NOT_CONFIGURED")) {
      console.error("[auth/register] smtp config missing", error.message);
      return NextResponse.json(
        {
          error: "Cadastro indisponivel no momento. Configuracao de e-mail pendente.",
          code: "AUTH_REGISTER_SMTP_NOT_CONFIGURED"
        },
        { status: 503 }
      );
    }
    console.error("[auth/register] unexpected error", error);
    return NextResponse.json({ error: "Falha ao cadastrar usuario.", code: "AUTH_REGISTER_UNEXPECTED" }, { status: 500 });
  }
}
