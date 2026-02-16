import { NextResponse } from "next/server";
import { hasSameOrigin, hashPassword, isStrongPassword } from "@/lib/auth";
import { createUser } from "@/lib/user-store";

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
      return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
    }

    const body = (await request.json()) as RegisterBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const username = body.username?.trim() ?? "";

    const error = validate(email, password, username);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await createUser(email, passwordHash, username);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Este e-mail ja esta cadastrado." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "USERNAME_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Este usuario ja esta em uso." }, { status: 409 });
    }
    console.error("[auth/register] unexpected error", error);
    return NextResponse.json({ error: "Falha ao cadastrar usuario." }, { status: 500 });
  }
}
