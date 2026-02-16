import type { Metadata } from "next";
import { ReactNode } from "react";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Rizzer LiveStation",
    template: "%s | Rizzer LiveStation"
  },
  description: "Plataforma da Rizzer para acompanhar varios canais e videos ao mesmo tempo.",
  applicationName: "Rizzer LiveStation",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Rizzer LiveStation",
    title: "Rizzer LiveStation",
    description: "Plataforma da Rizzer para acompanhar varios canais e videos ao mesmo tempo.",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "Rizzer LiveStation"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Rizzer LiveStation",
    description: "Plataforma da Rizzer para acompanhar varios canais e videos ao mesmo tempo.",
    images: ["/icon.png"]
  },
  robots: {
    index: true,
    follow: true
  },
  verification: {
    google: "L6JWMUEFQwWHy6A9ap5hT5E9LVDNJz41Y378YYIxsks",
    other: {
      "msvalidate.01": "DF375BD3D49EFF9E18C646B7E8685A2F"
    }
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Rizzer LiveStation",
    url: siteUrl,
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Web",
    sameAs: [toAbsoluteUrl("/login")]
  };

  return (
    <html lang="pt-BR">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        {children}
      </body>
    </html>
  );
}
