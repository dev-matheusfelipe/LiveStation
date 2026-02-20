"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type ForgotApiResponse = {
  error?: string;
  message?: string;
};

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = (await response.json()) as ForgotApiResponse;
      if (!response.ok) {
        setError(data.error ?? "Falha ao solicitar recuperacao.");
        return;
      }
      setMessage(data.message ?? "Se o e-mail existir, enviaremos o link de recuperacao.");
      setEmail("");
    } catch {
      setError("Falha ao solicitar recuperacao.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authPage">
      <div className="authPanel">
        <h1>Recuperar senha</h1>
        <p>Informe seu e-mail para receber o link de redefinicao.</p>
        <form onSubmit={onSubmit} className="authForm">
          <label>
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>
        {error ? <p className="statusError">{error}</p> : null}
        {message ? <p className="statusOk">{message}</p> : null}
        <p className="authInlineLinkRow">
          Lembrou a senha? <Link href="/login">Voltar ao login</Link>
        </p>
      </div>
    </main>
  );
}

