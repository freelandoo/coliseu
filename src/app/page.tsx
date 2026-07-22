import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/session";
import { rotaInicial, type Papel } from "@/lib/auth/rbac";

// O site público vive em outro repo (freelandoo/coliseu-site, na Vercel).
// Esta instância é o sistema: a raiz manda cada papel para a sua tela inicial
// (admin no painel, colaborador em matriculados) — sem sessão, vai pro login.
export default async function Home() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  redirect(rotaInicial(user.role as Papel));
}
