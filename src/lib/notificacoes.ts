import { prisma } from "@/lib/db";
import { enviarPush } from "@/lib/push/notificar";
import { listarInscricoesAdminsRepo } from "@/lib/repositories/push";

/**
 * Avisos para os administradores: ficam no sininho (com lido por pessoa) e
 * saem como push no celular de quem ativou.
 *
 * `chave` identifica o fato (ex.: "estorno:pay_x"). Reentrega de webhook ou
 * reconciliação que reencontra o mesmo estorno não avisa duas vezes — a linha
 * já existe para aquele admin e o push só sai para quem recebeu linha nova.
 */
export type TipoNotificacao = "pagamento_estornado" | "pagamento_chargeback";

export interface NovaNotificacao {
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  url?: string;
  chave: string;
}

export async function notificarAdmins(n: NovaNotificacao): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { ativo: true, role: "ADMIN" },
    select: { id: true },
  });
  if (admins.length === 0) return 0;

  const { count } = await prisma.notificacao.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      tipo: n.tipo,
      titulo: n.titulo,
      corpo: n.corpo,
      url: n.url ?? null,
      chave: n.chave,
    })),
    skipDuplicates: true,
  });
  if (count === 0) return 0; // fato já avisado

  try {
    await enviarPush(await listarInscricoesAdminsRepo(), {
      titulo: n.titulo,
      corpo: n.corpo,
      url: n.url ?? "/cobranca",
      tag: n.chave,
    });
  } catch (e) {
    // Push é cortesia: o aviso já está gravado no sininho.
    console.error("[notificacoes] push falhou:", e);
  }
  return count;
}

export async function listarNotificacoesRepo(userId: string, limite = 30) {
  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limite,
      select: { id: true, tipo: true, titulo: true, corpo: true, url: true, lidaEm: true, createdAt: true },
    }),
    prisma.notificacao.count({ where: { userId, lidaEm: null } }),
  ]);
  return { itens, naoLidas };
}

export async function marcarNotificacoesLidasRepo(userId: string): Promise<number> {
  const { count } = await prisma.notificacao.updateMany({
    where: { userId, lidaEm: null },
    data: { lidaEm: new Date() },
  });
  return count;
}
