import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { AdSenseUnit } from "@/components/adsense-unit";

export const metadata: Metadata = {
  title: "LiveStation Rizzer",
  description: "LiveStation da Rizzer para assistir multiplos videos e canais ao mesmo tempo.",
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
    <main className="authPage">
      <section className="authPanel">
        <h1>LiveStation Rizzer</h1>
        <p>
          O LiveStation da Rizzer permite acompanhar varios videos e canais em uma unica tela, com login e
          sincronizacao de sessao.
        </p>
        <Link href={primaryHref} className="ctaLink">
          {primaryLabel}
        </Link>
        <AdSenseUnit slot={homeAdSlot} className="adsPanel" />
      </section>
    </main>
  );
}
