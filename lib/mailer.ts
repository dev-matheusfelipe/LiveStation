import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const secureRaw = process.env.SMTP_SECURE?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (!host || !portRaw || !from) {
    return null;
  }

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const secure = secureRaw === "true";
  return {
    host,
    port,
    secure,
    user: user || undefined,
    pass: pass || undefined,
    from
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
  const config = getMailConfig();

  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_NOT_CONFIGURED");
    }

    console.log(`[mail/dev] verification link for ${toEmail} (${username}): ${verifyUrl}`);
    return;
  }

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
