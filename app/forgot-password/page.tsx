import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Esqueci minha senha",
  description: "Recupere o acesso da sua conta no Rizzer LiveStation.",
  alternates: {
    canonical: "/forgot-password"
  },
  robots: {
    index: false,
    follow: true
  }
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

