export function isAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const configured = (process.env.LIVESTATION_ADMIN_EMAILS ?? process.env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const fallback = (process.env.RIZZER_DEFAULT_EMAIL ?? "").trim().toLowerCase();
  if (fallback) {
    configured.push(fallback);
  }

  return new Set(configured).has(normalized);
}

