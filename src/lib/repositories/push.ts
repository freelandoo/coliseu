import { prisma } from "@/lib/db";

/**
 * Inscrições de Web Push. O endpoint identifica o aparelho/navegador: reassinar
 * é upsert (troca de dono se outra conta logar no mesmo aparelho), e cancelar
 * só apaga a inscrição do próprio usuário.
 */

export async function salvarInscricaoPushRepo(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: input,
    update: { userId: input.userId, p256dh: input.p256dh, auth: input.auth },
  });
}

export async function removerInscricaoPushRepo(userId: string, endpoint: string): Promise<boolean> {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return count > 0;
}

/** Aparelhos de quem atende (ADMIN/RECEPCAO ativos) — os destinos do aviso. */
export async function listarInscricoesAtendimentoRepo() {
  return prisma.pushSubscription.findMany({
    where: { user: { ativo: true, role: { in: ["ADMIN", "RECEPCAO"] } } },
    select: { endpoint: true, p256dh: true, auth: true },
  });
}

/** Limpeza de inscrição morta (push service devolveu 404/410). */
export async function apagarInscricaoPorEndpointRepo(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}
