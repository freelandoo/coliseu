import { prisma } from "@/lib/db";

/**
 * Histórico das liberações manuais da catraca (botão "Liberar catraca"):
 * quando, quem liberou, o motivo e se o agente executou no aparelho.
 *
 * Não afirma que alguém passou: depois de uma abertura remota o iDFace não
 * registra o giro de forma confiável (o "Interface WEB" que ele grava é a
 * própria abertura, não uma passagem).
 */

export interface Liberacao {
  id: string;
  quando: string;
  catraca: string;
  solicitadoPor: string | null;
  motivo: string | null;
  situacao: "executada" | "aguardando" | "expirada" | "falhou";
  erro: string | null;
}

export async function listarLiberacoes(limite = 30): Promise<Liberacao[]> {
  const cmds = await prisma.deviceCommand.findMany({
    where: { type: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, createdAt: true, status: true, lastError: true, payload: true, device: { select: { name: true } } },
  });
  return cmds.map((c) => {
    const payload = (c.payload ?? {}) as { motivo?: string | null; solicitadoPor?: string };
    const situacao: Liberacao["situacao"] =
      c.status === "SUCCEEDED"
        ? "executada"
        : c.status === "PENDING" || c.status === "DISPATCHED"
          ? "aguardando"
          : c.lastError?.startsWith("expirado")
            ? "expirada"
            : "falhou";
    return {
      id: c.id,
      quando: c.createdAt.toISOString(),
      catraca: c.device.name,
      solicitadoPor: payload.solicitadoPor ?? null,
      motivo: payload.motivo ?? null,
      situacao,
      erro: situacao === "falhou" ? c.lastError : null,
    };
  });
}
