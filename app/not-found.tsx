import Image from "next/image";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="notFoundPage">
      <div className="notFoundBrand">
        <span className="notFoundBrandLogo" aria-hidden="true">
          <Image src="/rizzer-logo-dark.png" alt="" fill sizes="160px" className="notFoundLogo" />
        </span>
      </div>

      <section className="notFoundCenter">
        <div className="notFoundDigits" aria-hidden="true">
          <span className="floatY">4</span>
          <span className="floatY delay">0</span>
          <span className="floatY">4</span>
        </div>

        <div className="notFoundCable">
          <span className="notFoundCableLine" />
          <span className="notFoundSpark">.</span>
          <span className="notFoundSpark delay">.</span>
          <span className="notFoundSpark delay2">.</span>
          <span className="notFoundCableLine" />
        </div>

        <h1>Pagina nao encontrada</h1>
        <p>A pagina que voce procura nao existe ou foi movida. Volte para a tela principal do LiveStation.</p>
        <Link href="/watch" className="notFoundButton">
          Voltar para o inicio
        </Link>
      </section>
    </main>
  );
}
