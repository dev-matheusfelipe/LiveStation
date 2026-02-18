"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdSenseUnit } from "@/components/adsense-unit";

type Mode = "login" | "register";
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved";
type AuthApiError = { error?: string; code?: string };

export function AuthForm() {
  const searchParams = useSearchParams();
  const loginAdSlot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_LOGIN?.trim();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function formatApiError(data: AuthApiError, fallback: string): string {
    const code = data.code?.trim();
    const text = data.error?.trim() || fallback;
    return code ? `${text} (${code})` : text;
  }

  useEffect(() => {
    const verify = searchParams.get("verify");
    if (!verify) {
      return;
    }

    setMode("login");
    if (verify === "success") {
      setError(null);
      setMessage("E-mail confirmado com sucesso. Agora faca login.");
      return;
    }
    if (verify === "already") {
      setError(null);
      setMessage("Sua conta ja estava verificada. Pode fazer login.");
      return;
    }
    if (verify === "invalid") {
      setMessage(null);
      setError("Link de verificacao invalido ou expirado.");
      return;
    }
    if (verify === "error") {
      setMessage(null);
      setError("Falha ao confirmar e-mail. Tente novamente.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (mode !== "register") {
      setUsernameStatus("idle");
      return;
    }

    const value = username.trim().toLowerCase();
    if (!value) {
      setUsernameStatus("idle");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value)}`);
        if (!response.ok) {
          setUsernameStatus("idle");
          return;
        }
        const data = (await response.json()) as { available: boolean; reason: string };
        if (data.available) {
          setUsernameStatus("available");
        } else if (data.reason === "TAKEN") {
          setUsernameStatus("taken");
        } else if (data.reason === "RESERVED") {
          setUsernameStatus("reserved");
        } else {
          setUsernameStatus("invalid");
        }
      } catch {
        setUsernameStatus("idle");
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [mode, username]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "register") {
        if (usernameStatus === "checking") {
          throw new Error("Aguarde a validacao do usuario.");
        }
        if (usernameStatus === "invalid") {
          throw new Error("Usuario invalido. Use 3-20 caracteres com letras, numeros e _.");
        }
        if (usernameStatus === "taken") {
          throw new Error("Este usuario ja esta em uso.");
        }
        if (usernameStatus === "reserved") {
          throw new Error("Este usuario e reservado. Escolha outro nome de usuario.");
        }

        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });
        const registerData = (await registerResponse.json()) as AuthApiError;
        if (!registerResponse.ok) {
          throw new Error(formatApiError(registerData, "Falha no cadastro."));
        }
        setMessage("Quase la. Verifique seu e-mail e clique no link para ativar a conta.");
        setMode("login");
        setUsername("");
        setEmail("");
        setPassword("");
      } else {
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const loginData = (await loginResponse.json()) as AuthApiError;
        if (!loginResponse.ok) {
          throw new Error(formatApiError(loginData, "Falha no login."));
        }
        window.location.replace("/watch");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authPage">
      <div className="authPanel">
        <h1>LiveStation</h1>
        <p>Cadastre um usuario unico, e depois entre com e-mail e senha.</p>

        <div className="modeSwitch">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Cadastro
          </button>
        </div>

        <form onSubmit={onSubmit} className="authForm">
          {mode === "register" ? (
            <>
              <label>
                Usuario
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="nome_unico"
                />
              </label>
              {usernameStatus === "checking" ? <p className="statusHint">Verificando disponibilidade...</p> : null}
              {usernameStatus === "available" ? <p className="statusOk">Usuario disponivel.</p> : null}
              {usernameStatus === "taken" ? <p className="statusError">Usuario ja em uso.</p> : null}
              {usernameStatus === "reserved" ? (
                <p className="statusError">Nome reservado. Escolha outro usuario.</p>
              ) : null}
              {usernameStatus === "invalid" ? (
                <p className="statusError">Use 3-20 caracteres com letras, numeros e _.</p>
              ) : null}
            </>
          ) : null}
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
          <label>
            Senha
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ caracteres com letras e numeros"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {error ? <p className="statusError">{error}</p> : null}
        {message ? <p className="statusOk">{message}</p> : null}
        <AdSenseUnit slot={loginAdSlot} className="adsPanel" />
      </div>
    </main>
  );
}
