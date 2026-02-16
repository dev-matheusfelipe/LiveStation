"use client";

import { FormEvent, useEffect, useState } from "react";

type Mode = "login" | "register";
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        setUsernameStatus(data.available ? "available" : data.reason === "TAKEN" ? "taken" : "invalid");
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

        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });
        const registerData = (await registerResponse.json()) as { error?: string };
        if (!registerResponse.ok) {
          throw new Error(registerData.error ?? "Falha no cadastro.");
        }
        setMessage("Cadastro criado. Agora faca login.");
        setMode("login");
        setUsername("");
      } else {
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const loginData = (await loginResponse.json()) as { error?: string };
        if (!loginResponse.ok) {
          throw new Error(loginData.error ?? "Falha no login.");
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
      </div>
    </main>
  );
}
