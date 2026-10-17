import type { Metadata, Viewport } from "next";
import { Oswald, Sora } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Coliseu CRM — Academia Coliseu Team",
  description:
    "CRM da Academia Coliseu Team: captação, matrícula, cobrança, renovação e retenção integradas com Asaas.",
  applicationName: "Coliseu CRM",
  // Instalado na tela de início do iOS, abre em janela própria (sem Safari).
  appleWebApp: {
    capable: true,
    title: "Coliseu",
    // Shell escuro: "black" é uma barra opaca escura com relógio e bateria
    // claros. Opaca de propósito — "black-translucent" desenharia o app por baixo
    // da barra e exigiria o recuo do topo também no iOS.
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // cor da barra do navegador/sistema = fundo do shell (rubi muito escuro)
  themeColor: "#21070f",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${oswald.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
