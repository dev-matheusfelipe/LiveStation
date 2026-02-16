const RESERVED_EXACT = new Set([
  "admin",
  "administrator",
  "root",
  "owner",
  "mod",
  "moderator",
  "staff",
  "support",
  "suporte",
  "official",
  "oficial",
  "system",
  "sys",
  "help",
  "contact",
  "contato",
  "security",
  "verificado",
  "verified",
  "rizzer"
]);

const FAMOUS_EXACT = new Set([
  "elonmusk",
  "billgates",
  "jeffbezos",
  "markzuckerberg",
  "cristianoronaldo",
  "leomessi",
  "neymar",
  "taylorswift",
  "selenagomez",
  "beyonce"
]);

const RESERVED_PARTS = ["admin", "support", "suporte", "official", "oficial", "mod", "staff", "rizzer"];

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export type UsernamePolicyResult =
  | { allowed: true }
  | { allowed: false; reason: "RESERVED_KEYWORD" | "FAMOUS_NAME" };

export function evaluateUsernamePolicy(username: string): UsernamePolicyResult {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return { allowed: true };
  }

  if (RESERVED_EXACT.has(normalized)) {
    return { allowed: false, reason: "RESERVED_KEYWORD" };
  }
  if (FAMOUS_EXACT.has(normalized)) {
    return { allowed: false, reason: "FAMOUS_NAME" };
  }

  for (const part of RESERVED_PARTS) {
    if (normalized.includes(part)) {
      return { allowed: false, reason: "RESERVED_KEYWORD" };
    }
  }

  return { allowed: true };
}
