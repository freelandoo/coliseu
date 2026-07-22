import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/session";
import { podeModulo, podePapel, rotaInicial, type Modulo, type Papel } from "@/lib/auth/modulos";

// Reexporta o mapa de papéis/módulos para quem já importava tudo daqui.
export {
  podePapel,
  podeModulo,
  modulosDoPapel,
  rotaInicial,
  type Papel,
  type Modulo,
} from "@/lib/auth/modulos";

export async function requireUser() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(exigidos: Papel[]) {
  const user = await requireUser();
  if (!podePapel(user.role as Papel, exigidos)) redirect(rotaInicial(user.role as Papel));
  return user;
}

/** Guard de página: quem não tem o módulo cai na própria tela inicial. */
export async function requireModulo(modulo: Modulo) {
  const user = await requireUser();
  if (!podeModulo(user.role as Papel, modulo)) redirect(rotaInicial(user.role as Papel));
  return user;
}
