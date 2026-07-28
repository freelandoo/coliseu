import type { Metadata, Viewport } from "next";
import { Oswald, Sora } from "next/font/google";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
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
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0f11",
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
      <body className="min-h-full">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
