import { NextResponse } from "next/server";
import { createResetPasswordToken, hasSameOrigin } from "@/lib/auth";
import { sendResetPasswordEmail } from "@/lib/mailer";
import { getSiteUrl } from "@/lib/site";
import { findUserByEmail } from "@/lib/user-store";

type ForgotPasswordBody = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ error: "Origem invalida.", code: "AUTH_FORGOT_ORIGIN_INVALID" }, { status: 403 });
    }

    const body = (await request.json()) as ForgotPasswordBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail invalido.", code: "AUTH_FORGOT_EMAIL_INVALID" }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (user) {
      const token = createResetPasswordToken(user.email);
      const resetUrl = `${getSiteUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await sendResetPasswordEmail(user.email, user.username ?? user.displayName ?? "usuario", resetUrl);
    }

    return NextResponse.json({
      ok: true,
      message: "Se o e-mail existir, voce recebera um link para redefinir a senha."
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SMTP_NOT_CONFIGURED")) {
      console.error("[auth/forgot-password] smtp config missing", error.message);
      return NextResponse.json(
        {
          error: "Recuperacao indisponivel no momento. Configuracao de e-mail pendente.",
          code: "AUTH_FORGOT_SMTP_NOT_CONFIGURED"
        },
        { status: 503 }
      );
    }
    console.error("[auth/forgot-password] unexpected error", error);
    return NextResponse.json({ error: "Falha ao iniciar recuperacao.", code: "AUTH_FORGOT_UNEXPECTED" }, { status: 500 });
  }
}

