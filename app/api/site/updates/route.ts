import { NextResponse } from "next/server";
import { LIVESTATION_CHANGELOG } from "@/lib/changelog";

export async function GET() {
  return NextResponse.json({ versions: LIVESTATION_CHANGELOG });
}

