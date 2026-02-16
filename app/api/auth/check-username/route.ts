import { NextResponse } from "next/server";
import { findUserByUsername } from "@/lib/user-store";
import { evaluateUsernamePolicy } from "@/lib/username-policy";

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") ?? "").trim().toLowerCase();

  if (!username) {
    return NextResponse.json({ available: false, reason: "EMPTY" }, { status: 400 });
  }

  if (!isValidUsername(username)) {
    return NextResponse.json({ available: false, reason: "INVALID" }, { status: 200 });
  }

  const usernamePolicy = evaluateUsernamePolicy(username);
  if (!usernamePolicy.allowed) {
    return NextResponse.json({ available: false, reason: "RESERVED" }, { status: 200 });
  }

  const existing = await findUserByUsername(username);
  return NextResponse.json({
    available: !existing,
    reason: existing ? "TAKEN" : "OK"
  });
}
