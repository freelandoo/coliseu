import type { MetadataRoute } from "next";

// A raiz redireciona cada papel para a sua tela inicial (sem sessão → login),
// então "/" serve de start_url para qualquer usuário do PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coliseu CRM — Academia Coliseu Team",
    short_name: "Coliseu",
    description:
      "CRM da Academia Coliseu Team: captação, matrícula, cobrança, renovação e retenção integradas com Asaas.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f11",
    theme_color: "#0e0f11",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
