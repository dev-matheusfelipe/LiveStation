import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { AdSenseUnit } from "@/components/adsense-unit";

export const metadata: Metadata = {
  title: "LiveStation Rizzer | Multitelas para Lives ao Vivo",
  description:
    "Nova forma de acompanhar diversas lives em um so lugar. Multiplas telas, sincronizacao e experiencia premium no LiveStation Rizzer.",
  alternates: {
    canonical: "/"
  }
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  const primaryHref = session ? "/watch" : "/login";
  const primaryLabel = session ? "Abrir LiveStation" : "Entrar no LiveStation";

  const homeAdSlot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME?.trim();

  return (
    <main className="homeLanding">
      <section className="homeTop">
        <section className="homeHero">
          <p className="homeKicker">Rizzer LiveStation</p>
          <h1>A nova forma de acompanhar varias lives em um so lugar.</h1>
          <p className="homeLead">
            Reuna canais ao vivo em multitelas, organize sua visao em segundos e acompanhe o que importa sem trocar de
            aba o tempo inteiro.
          </p>
          <p className="homeLead homeLeadSoft">
            LiveStation combina velocidade, clareza visual e controle real para quem vive de live, acompanha eventos ou
            quer assistir multiplas transmissoes ao mesmo tempo.
          </p>
          <div className="homeActions">
            <Link href={primaryHref} className="homePrimaryCta">
              {primaryLabel}
            </Link>
            <Link href="/login" className="homeSecondaryCta">
              Criar conta e comecar
            </Link>
          </div>
        </section>

        <section className="homePreviewColumn">
          <section className="homeAppPreview" aria-label="Preview do LiveStation">
            <Image
              src="/image-liveStation.jpeg"
              alt="Preview da plataforma LiveStation em funcionamento com varias lives ao mesmo tempo."
              fill
              sizes="(max-width: 980px) 100vw, 46vw"
              className="homeAppPreviewImg"
              priority
            />
          </section>
          <div className="homeTags" aria-label="Hashtags do projeto">
            <span>#Rizzer</span>
            <span>#LiveStationRizzer</span>
            <span>#MultiplasTelas</span>
          </div>
        </section>
      </section>

      <section className="homeValue">
        <h2>Mais foco, mais contexto, mais alcance.</h2>
        <p>
          Para quem pesquisa no Google por plataforma para assistir varias lives, assistir varios canais ao vivo ou
          acompanhar multiplas transmissoes, o LiveStation Rizzer entrega uma experiencia profissional pronta para uso.
        </p>
      </section>

      <AdSenseUnit slot={homeAdSlot} className="homeAdStrip" />
      <span className="homeRizzerMark" aria-hidden="true">
        <Image src="/rizzer-logo-dark.png" alt="" fill sizes="170px" className="homeRizzerMarkImg" />
      </span>
    </main>
  );
}
