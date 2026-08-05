import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "coliseu_session";

/**
 * Sessão que não expira na prática — o Coliseu instalado no celular tem de
 * abrir como qualquer aplicativo, sem pedir senha toda vez.
 *
 * São dois prazos, e eles fazem coisas diferentes:
 *
 * - `DIAS_COOKIE` é quanto tempo o navegador guarda o cookie. 400 dias é o teto
 *   que os navegadores aceitam desde 2022 (pedir mais é o mesmo que pedir 400).
 * - `DIAS_SESSAO` é a validade da linha no banco, e ela **desliza**: cada uso
 *   empurra o vencimento para a frente. Quem entra ao menos uma vez a cada seis
 *   meses nunca mais vê a tela de login; conta abandonada ainda vence sozinha,
 *   que é o que impede um cookie roubado de valer para sempre.
 *
 * A saída continua existindo e continua imediata: "Sair" apaga a linha, e a
 * troca de senha derruba as outras sessões. Num balcão compartilhado é por ali
 * que se encerra o turno — não pela expiração.
 */
const DIAS_COOKIE = 400;
const DIAS_SESSAO = 180;
/** Renova no máximo uma vez por dia: sessão em uso não precisa de escrita a cada request. */
const FOLGA_RENOVACAO_MS = 86_400_000;

function vencimento(): Date {
  return new Date(Date.now() + DIAS_SESSAO * 86_400_000);
}

export async function criarSessao(userId: string): Promise<void> {
  const s = await prisma.session.create({ data: { userId, expiresAt: vencimento() } });
  (await cookies()).set(COOKIE, s.id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: new Date(Date.now() + DIAS_COOKIE * 86_400_000),
  });
}

/** Id da sessão atual (cookie) — útil para preservá-la ao revogar as demais. */
export async function sessaoAtualId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function usuarioAtual() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const s = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  // Desativar o colaborador derruba o acesso na hora, sem esperar a sessão expirar.
  if (!s.user.ativo) return null;

  // Deslize do vencimento: quem está usando o sistema não deveria ser deslogado
  // por tempo. Só a linha do banco é empurrada — o cookie, que já nasceu com o
  // prazo máximo do navegador, não precisa ser reescrito, e escrevê-lo aqui nem
  // seria possível: `usuarioAtual` roda também dentro de Server Component, onde
  // o Next proíbe mexer no cookie. Falha de escrita não derruba a navegação: no
  // pior caso a renovação acontece no request seguinte.
  const novo = vencimento();
  if (novo.getTime() - s.expiresAt.getTime() > FOLGA_RENOVACAO_MS) {
    await prisma.session
      .update({ where: { id }, data: { expiresAt: novo } })
      .catch(() => undefined);
  }

  return s.user;
}

export async function destruirSessao(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await prisma.session.delete({ where: { id } }).catch(() => {});
  jar.delete(COOKIE);
}
