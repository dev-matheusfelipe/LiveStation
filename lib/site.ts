const LOCAL_FALLBACK_URL = "http://localhost:3000";

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return LOCAL_FALLBACK_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return LOCAL_FALLBACK_URL;
  }
}

export function getSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    LOCAL_FALLBACK_URL;
  return normalizeSiteUrl(configured);
}

export function toAbsoluteUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getSiteUrl()}${path}`;
}
