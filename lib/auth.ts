import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = "livestation_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 30;
export const RESET_PASSWORD_TTL_SECONDS = 60 * 30;

type SessionPayload = {
  email: string;
  exp: number;
};

type EmailVerificationPayload = {
  typ: "verify_email";
  email: string;
  username: string;
  passwordHash: string;
  exp: number;
};

type ResetPasswordPayload = {
  typ: "reset_password";
  email: string;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret(): string {
  const explicitSecret = process.env.AUTH_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "change-this-secret-in-production";
  }

  // Vercel fallback to avoid hard failure when AUTH_SECRET was not configured.
  // It is deterministic for the deployment and should be replaced by AUTH_SECRET.
  const vercelEntropy = [
    process.env.VERCEL_DEPLOYMENT_ID,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_ORG_ID
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("|");

  if (vercelEntropy) {
    console.warn("[auth] AUTH_SECRET is missing in production. Using derived Vercel fallback secret.");
    return createHash("sha256").update(`livestation:${vercelEntropy}`).digest("hex");
  }

  throw new Error("AUTH_SECRET must be set in production.");
}

function sign(input: string): string {
  return createHmac("sha256", getSessionSecret()).update(input).digest("base64url");
}

export function createSessionToken(email: string): string {
  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function createEmailVerificationToken(email: string, username: string, passwordHash: string): string {
  const payload: EmailVerificationPayload = {
    typ: "verify_email",
    email: email.trim().toLowerCase(),
    username: username.trim().toLowerCase(),
    passwordHash,
    exp: Math.floor(Date.now() / 1000) + EMAIL_VERIFICATION_TTL_SECONDS
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function createResetPasswordToken(email: string): string {
  const payload: ResetPasswordPayload = {
    typ: "reset_password",
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + RESET_PASSWORD_TTL_SECONDS
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function isStrongPassword(password: string): boolean {
  if (password.length < 8) {
    return false;
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!origin) {
    return true;
  }
  try {
    const originUrl = new URL(origin);
    const allowedHosts = new Set<string>();
    if (host) {
      allowedHosts.add(host.trim().toLowerCase());
    }
    if (forwardedHost) {
      for (const value of forwardedHost.split(",")) {
        const normalized = value.trim().toLowerCase();
        if (normalized) {
          allowedHosts.add(normalized);
        }
      }
    }
    if (allowedHosts.size === 0) {
      return true;
    }
    return allowedHosts.has(originUrl.host.toLowerCase());
  } catch {
    return false;
  }
}

export function verifySessionToken(token?: string): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (!payload.email || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function verifyEmailVerificationToken(token?: string): EmailVerificationPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as EmailVerificationPayload;
    if (
      payload.typ !== "verify_email" ||
      !payload.email ||
      !payload.username ||
      !payload.passwordHash ||
      !payload.exp
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function verifyResetPasswordToken(token?: string): ResetPasswordPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as ResetPasswordPayload;
    if (payload.typ !== "reset_password" || !payload.email || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) {
    return false;
  }

  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== key.length) {
    return false;
  }
  return timingSafeEqual(key, expected);
}
