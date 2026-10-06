import { prisma } from "@/lib/db";
import { carregarContextoAcesso } from "@/lib/access/context";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import { provisionarAcessoDePessoa } from "@/lib/access/provision";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import type { AccessReason } from "@/lib/access/types";

/**
 * "Por que este aluno não passa na catraca?" — a mesma decisão que a política
 * toma, traduzida para a recepção, com o que falta e os últimos comandos
 * enviados ao aparelho (inclusive o erro que o iDFace devolveu).
 */

const MOTIVO: Record<AccessReason, string> = {
  OK: "Liberado: matrícula ativa e em dia.",
  EM_CARENCIA: "Liberado na carência: a mensalidade venceu há poucos dias. Receba o pagamento antes que a carência acabe.",
  CORTESIA: "Liberado por cortesia (1 entrada) enquanto aguarda o 1º pagamento.",
  SEM_BIOMETRIA: "Sem face cadastrada. Cadastre a face na tela Acesso.",
  AGUARDANDO_SYNC: "Ainda não está no aparelho (envio pendente ou com erro). Use \"Corrigir agora\".",
  AGUARDANDO_PAGAMENTO: "Matrícula aguardando o 1º pagamento. Receba no balcão (Renovar) ou pelo link.",
  INADIMPLENTE: "Mensalidade vencida além da carência, ou estornada. Receba o pagamento para liberar.",
  CANCELADO: "Matrícula cancelada. Faça uma nova matrícula.",
  EXPIRADO: "Plano vencido. Renove a matrícula.",
  SUSPENSO: "Matrícula suspensa. Regularize o pagamento.",
  OVERRIDE_ALLOW: "Liberado por liberação manual.",
  OVERRIDE_BLOCK: "Bloqueado manualmente.",
  FORA_DE_HORARIO: "Fora do horário permitido pelo plano.",
};

export interface DiagnosticoAcesso {
  liberado: boolean;
  motivo: string;
  checklist: { item: string; ok: boolean; detalhe: string }[];
  comandos: { type: string; status: string; lastError: string | null; createdAt: string; device: string }[];
}

export async function diagnosticarAcesso(personId: string): Promise<DiagnosticoAcesso | null> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { fase: true } });
  if (!person) return null;

  const { ctx, membership, mappings } = await carregarContextoAcesso(personId);
  const decisao = evaluateAccessEligibility(ctx);
  const [devices, credenciais, comandos] = await Promise.all([
    prisma.accessDevice.findMany({ select: { id: true, name: true } }),
    prisma.accessCredential.findMany({ where: { personId, revokedAt: null }, select: { type: true, status: true } }),
    prisma.deviceCommand.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { type: true, status: true, lastError: true, createdAt: true, deviceId: true },
    }),
  ]);
  const nomeDevice = new Map(devices.map((d) => [d.id, d.name]));
  const venc = membership?.vencimentoPlano.toLocaleDateString("pt-BR", { timeZone: "UTC" });

  const checklist = [
    {
      item: "Matrícula",
      ok: membership?.status === "ACTIVE",
      detalhe: membership ? `${membership.status} · plano vence ${venc}` : "sem matrícula",
    },
    {
      item: "Mensalidade",
      ok: ctx.billingStatus === "PAID" || (ctx.billingStatus === "PENDING" && ctx.diasAtraso <= 0) ||
        (ctx.billingStatus === null && (ctx.diasAposVencimentoPlano ?? 1) <= ctx.graceDays),
      detalhe:
        ctx.billingStatus === null
          ? "sem cobrança no Coliseu — vale o vencimento do plano"
          : `${ctx.billingStatus}${ctx.diasAtraso > 0 ? ` · ${ctx.diasAtraso} dia(s) de atraso` : ""}`,
    },
    {
      item: "Face cadastrada",
      ok: ctx.temCredencialEnrolled,
      detalhe: credenciais.length ? credenciais.map((c) => `${c.type}: ${c.status}`).join(", ") : "nenhuma",
    },
    {
      item: "No aparelho",
      ok: ctx.sincronizado,
      detalhe: mappings.length
        ? mappings.map((m) => `${nomeDevice.get(m.deviceId) ?? "catraca"} #${m.externalUserId}: ${m.syncStatus}`).join(", ")
        : "não provisionado",
    },
  ];

  return {
    liberado: decisao.allow,
    motivo: MOTIVO[decisao.reason] ?? decisao.reason,
    checklist,
    comandos: comandos.map((c) => ({
      type: c.type,
      status: c.status,
      lastError: c.lastError,
      createdAt: c.createdAt.toISOString(),
      device: nomeDevice.get(c.deviceId) ?? "catraca",
    })),
  };
}

/**
 * "Corrigir agora": garante o aluno no aparelho e reenvia a decisão atual.
 * Mapping com erro volta para pendente e ganha UPSERT novo; quem já está
 * sincronizado NÃO é reenviado (preserva o cadastro adotado do CloudGym) —
 * só recebe ENABLE/DISABLE de novo conforme a política.
 */
export async function corrigirAcesso(personId: string): Promise<{ reenvios: number }> {
  await prisma.deviceUserMapping.updateMany({
    where: { personId, syncStatus: "ERROR" },
    data: { syncStatus: "PENDING" },
  });
  const { comandos } = await provisionarAcessoDePessoa(personId);
  await recalcularAcessoDePessoa(personId);
  return { reenvios: comandos };
}
