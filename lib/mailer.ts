import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

type MailConfigResolution =
  | { ok: true; config: MailConfig }
  | { ok: false; missing: string[] };

let cachedTransporter: nodemailer.Transporter | null = null;

function getMailConfig(): MailConfigResolution {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const secureRaw = process.env.SMTP_SECURE?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim();

  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!portRaw) missing.push("SMTP_PORT");
  if (!from) missing.push("SMTP_FROM");

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const hostValue = host as string;
  const portRawValue = portRaw as string;
  const fromValue = from as string;
  const port = Number.parseInt(portRawValue, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, missing: ["SMTP_PORT"] };
  }

  const secure = secureRaw === "true";
  return {
    ok: true,
    config: {
      host: hostValue,
      port,
      secure,
      user: user || undefined,
      pass: pass || undefined,
      from: fromValue
    }
  };
}

function getTransporter(config: MailConfig): nodemailer.Transporter {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined
  });

  return cachedTransporter;
}

export async function sendVerificationEmail(toEmail: string, username: string, verifyUrl: string): Promise<void> {
  const configResult = getMailConfig();

  if (!configResult.ok) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`SMTP_NOT_CONFIGURED:${configResult.missing.join(",")}`);
    }

    console.log(`[mail/dev] verification link for ${toEmail} (${username}): ${verifyUrl}`);
    return;
  }

  const config = configResult.config;
  const transporter = getTransporter(config);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2>Confirme seu e-mail no Rizzer LiveStation</h2>
      <p>Oi, ${username}. Clique no botao abaixo para ativar sua conta:</p>
      <p>
        <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#1f8cff;color:#fff;text-decoration:none;border-radius:6px;">
          Confirmar e-mail
        </a>
      </p>
      <p>Se o botao nao funcionar, copie e cole este link no navegador:</p>
      <p>${verifyUrl}</p>
      <p>Este link expira em 30 minutos.</p>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to: toEmail,
    subject: "Confirme seu e-mail - Rizzer LiveStation",
    text: `Confirme seu e-mail acessando: ${verifyUrl}`,
    html
  });
}
