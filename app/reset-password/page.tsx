import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
  description: "Crie uma nova senha para acessar o Rizzer LiveStation.",
  alternates: {
    canonical: "/reset-password"
  },
  robots: {
    index: false,
    follow: true
  }
};

type ResetPasswordPageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const token = params?.token ?? "";
  return <ResetPasswordForm token={token} />;
}
