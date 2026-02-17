import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserByEmail } from "@/lib/user-store";
import { WatchStation } from "@/components/watch-station";

export const metadata: Metadata = {
  title: "Watch | LiveStation Rizzer",
  description: "Area autenticada do LiveStation Rizzer para assistir e organizar multiplos canais em tela unica.",
  alternates: {
    canonical: "/watch"
  },
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

export default async function WatchPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    redirect("/login");
  }
  const user = await findUserByEmail(session.email);
  if (!user) {
    redirect("/login");
  }

  return <WatchStation email={session.email} />;
}
