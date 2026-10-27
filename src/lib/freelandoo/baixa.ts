import { prisma } from "@/lib/db";
import { desfazerRecebimentoAsaas, ehIdAsaasReal, receberEmDinheiroAsaas } from "@/lib/asaas";
import { aplicarPagamento } from "@/lib/billing/aplicar";
import { sincronizarMembership } from "@/lib/billing/apply";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { mapCobrancaStatus, normalizarCpf } from "@/lib/freelandoo/mapping";

/**
 * Mensalidade paga PELA FREELANDOO (Freelandoo mig 310).
 *
 * O aluno pagou no app da Freelandoo (Mercado Pago dela); ela fica com a
 * tarifa + R$ 2,50 e repassa o resto por PIX. Aqui a cobrança precisa
 * baixar — senão o Asaas segue cobrando e lembrando o aluno de uma fatura que
 * ele já pagou, e a catraca pode barrar quem está em dia.
 *
 * A baixa no Asaas é "recebido em dinheiro" (como a venda de balcão), não
 * cancelamento: o histórico do aluno fica certo e o estorno tem volta
 * (`undoReceivedInCash`).
 *
 * Idempotente por `ref` (`freelandoo:<pedido>`): a Freelandoo repete a
 * chamada até receber resposta.
 */

export type Falha = { error: string; status: number };

/** O que a Freelandoo precisa saber para mostrar o botão "Pagar". */
export function capabilities() {
  return { supports_paid_callback: true };
}

function itemDe(c: {
  id: string;
  valor: number;
  vencimento: Date;
  status: Parameters<typeof mapCobrancaStatus>[0];
  updatedAt: Date;
  metodo: string | null;
  freelandooRef: string | null;
  person: { cpf: string | null } | null;
}) {
  return {
    id: c.id,
    cpf: normalizarCpf(c.person?.cpf),
    amount_cents: Math.round(c.valor * 100),
    due_date: c.vencimento.toISOString(),
    status: mapCobrancaStatus(c.status),
    paid_at: c.status === "pago" ? c.updatedAt.toISOString() : null,
    method: c.freelandooRef ? "freelandoo" : (c.metodo ?? null),
  };
}

/** GET /api/freelandoo/payments/:id — a cobrança AGORA (reconferida antes do checkout). */
export async function paymentById(id: string) {
  const c = await prisma.cobranca.findUnique({
    where: { id },
    include: { person: { select: { cpf: true } } },
  });
  return c ? itemDe(c) : null;
}

/** Forma "freelandoo" para a lista do contrato. */
export function metodoDe(c: { metodo: string | null; freelandooRef: string | null }): string | null {
  return c.freelandooRef ? "freelandoo" : (c.metodo ?? null);
}

/** POST /api/freelandoo/payments/:id/paid */
export async function baixarPelaFreelandoo(
  id: string,
  input: { amount_cents?: number; paid_at?: string; ref?: string },
): Promise<{ ok: true; already: boolean } | Falha> {
  const ref = String(input.ref || "").trim();
  if (!ref.startsWith("freelandoo:")) return { error: "ref inválido", status: 400 };

  const cob = await prisma.cobranca.findUnique({ where: { id } });
  if (!cob) return { error: "not_found", status: 404 };
  if (cob.freelandooRef === ref) return { ok: true, already: true };
  if (cob.status === "pago") {
    // Pagou aqui E lá (link do Asaas no meio do checkout). Quem resolve é o
    // admin da Freelandoo — ela estorna o aluno; aqui nada muda.
    return { error: "already_paid", status: 409 };
  }
  if (cob.status !== "pendente" && cob.status !== "atrasado") {
    return { error: "not_open", status: 409 };
  }

  // Reserva a cobrança para ESTE pedido antes de falar com o Asaas: duas
  // chamadas simultâneas não dão duas baixas.
  const reservado = await prisma.cobranca.updateMany({
    where: { id, freelandooRef: null },
    data: { freelandooRef: ref, metodo: "freelandoo" },
  });
  if (reservado.count === 0) {
    const atual = await prisma.cobranca.findUnique({ where: { id } });
    return atual?.freelandooRef === ref ? { ok: true, already: true } : { error: "conflict", status: 409 };
  }

  const pagoEm = input.paid_at ? new Date(input.paid_at) : new Date();
  try {
    if (ehIdAsaasReal(cob.asaasId)) {
      await receberEmDinheiroAsaas(cob.asaasId, cob.valor);
      // Caminho único do Coliseu: Payment + Cobranca + matrícula + catraca.
      await aplicarPagamento(
        { id: cob.asaasId, billingType: "FREELANDOO", paymentDate: pagoEm.toISOString().slice(0, 10) },
        "PAID",
        new Date(),
      );
    } else {
      // Cobrança só local (sem Asaas): projeta direto.
      await prisma.$transaction(async (tx) => {
        await tx.cobranca.update({ where: { id }, data: { status: "pago" } });
        if (cob.tipo !== "avulsa") await sincronizarMembership(tx, cob.personId, "PAID", cob.vencimento);
      });
      await recalcularAcessoDePessoa(cob.personId).catch((e) =>
        console.error("[freelandoo] falha ao recalcular acesso:", e),
      );
    }
  } catch (e) {
    // Solta a reserva: a Freelandoo tenta de novo no próximo ciclo.
    await prisma.cobranca.update({ where: { id }, data: { freelandooRef: null, metodo: cob.metodo } });
    console.error("[freelandoo] baixa falhou:", e);
    return { error: "asaas_error", status: 502 };
  }
  return { ok: true, already: false };
}

/** POST /api/freelandoo/payments/:id/reopened — estorno antes do repasse. */
export async function reabrirPelaFreelandoo(
  id: string,
  input: { ref?: string },
): Promise<{ ok: true; already: boolean } | Falha> {
  const ref = String(input.ref || "").trim();
  const cob = await prisma.cobranca.findUnique({ where: { id } });
  if (!cob) return { error: "not_found", status: 404 };
  if (cob.freelandooRef !== ref) {
    // Já reaberta (repetição) — ou a baixa nunca foi desta referência.
    return cob.freelandooRef === null ? { ok: true, already: true } : { error: "ref_mismatch", status: 409 };
  }

  const status = cob.vencimento < new Date() ? "OVERDUE" : "PENDING";
  try {
    if (ehIdAsaasReal(cob.asaasId)) {
      await desfazerRecebimentoAsaas(cob.asaasId);
      await aplicarPagamento({ id: cob.asaasId }, status, new Date());
    } else {
      await prisma.cobranca.update({
        where: { id },
        data: { status: status === "OVERDUE" ? "atrasado" : "pendente" },
      });
    }
  } catch (e) {
    console.error("[freelandoo] reabertura falhou:", e);
    return { error: "asaas_error", status: 502 };
  }
  await prisma.cobranca.update({ where: { id }, data: { freelandooRef: null, metodo: null } });
  return { ok: true, already: false };
}
