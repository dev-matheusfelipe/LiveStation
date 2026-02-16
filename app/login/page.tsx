import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Login",
  description: "Acesse sua conta no Rizzer LiveStation.",
  alternates: {
    canonical: "/login"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (session) {
    redirect("/watch");
  }
  return <AuthForm />;
}
