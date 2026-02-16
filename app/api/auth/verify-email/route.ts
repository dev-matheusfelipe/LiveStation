import { NextResponse } from "next/server";
import { verifyEmailVerificationToken } from "@/lib/auth";
import { createUser } from "@/lib/user-store";
import { evaluateUsernamePolicy } from "@/lib/username-policy";

type VerifyResult = "success" | "invalid" | "already" | "error";

function redirectToLogin(request: Request, result: VerifyResult): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("verify", result);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const payload = verifyEmailVerificationToken(token);
  if (!payload) {
    return redirectToLogin(request, "invalid");
  }
  const usernamePolicy = evaluateUsernamePolicy(payload.username);
  if (!usernamePolicy.allowed) {
    return redirectToLogin(request, "invalid");
  }

  try {
    await createUser(payload.email, payload.passwordHash, payload.username);
    return redirectToLogin(request, "success");
  } catch (error) {
    if (error instanceof Error && (error.message === "EMAIL_ALREADY_EXISTS" || error.message === "USERNAME_ALREADY_EXISTS")) {
      return redirectToLogin(request, "already");
    }
    console.error("[auth/verify-email] unexpected error", error);
    return redirectToLogin(request, "error");
  }
}
