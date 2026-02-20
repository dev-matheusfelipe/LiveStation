"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type ResetApiResponse = {
  error?: string;
};

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const normalizedToken = useMemo(() => token.trim(), [token]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!normalizedToken) {
      setError("Link invalido ou expirado.");
      return;
    }
    if (password !== confirmPassword) {
      setError("A confirmacao da senha nao confere.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: normalizedToken, password })
      });
      const data = (await response.json()) as ResetApiResponse;
      if (!response.ok) {
        setError(data.error ?? "Falha ao redefinir senha.");
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setMessage("Senha redefinida com sucesso. Agora voce pode entrar.");
    } catch {
      setError("Falha ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authPage">
      <div className="authPanel">
        <h1>Redefinir senha</h1>
        <p>Crie uma nova senha para sua conta.</p>
        <form onSubmit={onSubmit} className="authForm">
          <label>
            Nova senha
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ caracteres com letras e numeros"
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
        {error ? <p className="statusError">{error}</p> : null}
        {message ? <p className="statusOk">{message}</p> : null}
        <div className="authBackButtonWrap">
          <Link href="/login" className="authBackButton">
            Voltar para login
          </Link>
        </div>
      </div>
    </main>
  );
}
