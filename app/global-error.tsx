"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main className="authPage">
          <div className="authPanel">
            <h1>Falha global</h1>
            <p>O aplicativo encontrou um erro critico.</p>
            <button type="button" onClick={() => reset()}>
              Recarregar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
