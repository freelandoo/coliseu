import { prisma } from "@/lib/db";
import { ehIdAsaasReal } from "@/lib/asaas";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";

/**
 * Vencimento automático de matrícula.
 *
 * Regra: matrícula ACTIVE (a mais recente do aluno) cujo `vencimentoPlano`
 * passou há mais de CARENCIA_DIAS vira EXPIRED, e o acesso é reavaliado — a
 * catraca recebe DISABLE.
 *
 * Fica de fora quem tem assinatura REAL ativa no Asaas: a mensalidade em dia
 * empurra o vencimento (ver sincronizarMembership), e a inadimplência já é
 * tratada pela carência da cobrança. Assinatura mock/balcão não renova
 * sozinha, então não protege ninguém.
 *
 * Modo (env EXPIRACAO_MATRICULAS): "ativa" vence de verdade; "simular"
 * (padrão) só calcula e registra quem venceria; "desligada" não roda. O padrão
 * é simular porque, antes do corte do CloudGym, a base adotada tem
 * vencimentos desatualizados — vencer de verdade bloquearia aluno em dia na
 * catraca real.
 */

export const CARENCIA_DIAS = 5;

export type ModoExpiracao = "ativa" | "simular" | "desligada";

export function modoExpiracao(): ModoExpiracao {
  const v = (process.env.EXPIRACAO_MATRICULAS ?? "").trim().toLowerCase();
  return v === "ativa" || v === "desligada" ? v : "simular";
}

export interface CandidatoExpiracao {
  membershipId: string;
  personId: string;
  nome: string;
  codigo: string;
  plano: string;
  vencimentoPlano: string;
  diasVencido: number;
}

/** Quem venceria agora (sem alterar nada). */
export async function candidatosExpiracao(agora = new Date()): Promise<CandidatoExpiracao[]> {
  const limite = new Date(agora.getTime() - CARENCIA_DIAS * 86_400_000);
  const vencidas = await prisma.membership.findMany({
    where: { status: "ACTIVE", vencimentoPlano: { lt: limite } },
    orderBy: { vencimentoPlano: "asc" },
    select: {
      id: true,
      personId: true,
      vencimentoPlano: true,
      matriculadoEm: true,
      plan: { select: { nome: true } },
      person: {
        select: {
          nome: true,
          codigo: true,
          memberships: { orderBy: { matriculadoEm: "desc" }, take: 1, select: { id: true } },
          billingCustomer: {
            select: { subscriptions: { where: { status: "ACTIVE" }, select: { asaasSubscriptionId: true } } },
          },
        },
      },
    },
  });

  return vencidas
    // Só a matrícula mais recente decide (renovação cria outra; a antiga não conta).
    .filter((m) => m.person.memberships[0]?.id === m.id)
    .filter(
      (m) => !(m.person.billingCustomer?.subscriptions ?? []).some((s) => ehIdAsaasReal(s.asaasSubscriptionId)),
    )
    .map((m) => ({
      membershipId: m.id,
      personId: m.personId,
      nome: m.person.nome,
      codigo: m.person.codigo,
      plano: m.plan.nome,
      vencimentoPlano: m.vencimentoPlano.toISOString(),
      diasVencido: Math.floor((agora.getTime() - m.vencimentoPlano.getTime()) / 86_400_000),
    }));
}

export interface ResultadoExpiracao {
  modo: ModoExpiracao;
  candidatos: number;
  expiradas: number;
}

/**
 * Vence as matrículas (modo "ativa") ou só conta (demais modos). `forcar`
 * aplica mesmo fora do modo ativo — é o botão do admin na prévia.
 */
export async function expirarMatriculasVencidas(opts: { agora?: Date; forcar?: boolean } = {}): Promise<ResultadoExpiracao> {
  const modo = modoExpiracao();
  const candidatos = await candidatosExpiracao(opts.agora);
  const aplicar = opts.forcar || modo === "ativa";
  if (!aplicar) return { modo, candidatos: candidatos.length, expiradas: 0 };

  let expiradas = 0;
  for (const c of candidatos) {
    // Condicional: se um pagamento reativou no meio do caminho, não mexe.
    const { count } = await prisma.membership.updateMany({
      where: { id: c.membershipId, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    if (count === 0) continue;
    expiradas++;
    try {
      await recalcularAcessoDePessoa(c.personId);
    } catch (e) {
      console.error("[expiracao] falha ao recalcular acesso:", e);
    }
  }
  return { modo, candidatos: candidatos.length, expiradas };
}
