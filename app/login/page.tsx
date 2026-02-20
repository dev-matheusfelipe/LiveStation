import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserByEmail } from "@/lib/user-store";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Login",
  description: "Acesse sua conta no Rizzer LiveStation.",
  alternates: {
    canonical: "/login"
  },
  robots: {
    index: false,
    follow: true
  }
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (session) {
    const user = await findUserByEmail(session.email);
    if (user) {
      redirect("/watch");
    }
  }
  return <AuthForm />;
}
