import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/session";

export type Papel = "ADMIN" | "RECEPCAO" | "TECNICO";

export function podePapel(papel: Papel, exigidos: Papel[]): boolean {
  if (papel === "ADMIN") return true;
  return exigidos.includes(papel);
}

export async function requireUser() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(exigidos: Papel[]) {
  const user = await requireUser();
  if (!podePapel(user.role as Papel, exigidos)) redirect("/painel");
  return user;
}
