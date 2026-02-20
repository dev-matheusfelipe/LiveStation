import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rizzer LiveStation",
    short_name: "LiveStation",
    description: "Plataforma da Rizzer para acompanhar varios canais e videos ao mesmo tempo.",
    start_url: "/login",
    display: "standalone",
    background_color: "#0f1115",
    theme_color: "#0f1115",
    icons: [
      {
        src: "/Logo_Favicon_512x512_Rizzer.ico",
        sizes: "any",
        type: "image/x-icon"
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
