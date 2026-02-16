"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="authPage">
      <div className="authPanel">
        <h1>Erro na pagina</h1>
        <p>Ocorreu um erro inesperado ao carregar esta rota.</p>
        <button type="button" onClick={() => reset()}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
