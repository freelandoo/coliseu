import { redirect } from "next/navigation";

// O site público vive em outro repo (freelandoo/coliseu-site, na Vercel).
// Esta instância é o sistema: raiz manda direto para o painel (o proxy
// redireciona para /login quem não tem sessão).
export default function Home() {
  redirect("/painel");
}
