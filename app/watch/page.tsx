import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { WatchStation } from "@/components/watch-station";

export const metadata: Metadata = {
  title: "Watch",
  robots: {
    index: false,
    follow: false
  }
};

export default async function WatchPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    redirect("/login");
  }

  return <WatchStation email={session.email} />;
}
