import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { processarEvento } from "@/lib/billing/processor";
import {
  upsertBillingCustomerRepo,
  upsertBillingSubscriptionRepo,
  upsertPaymentRepo,
} from "@/lib/repositories/billing";

type Ctx = { params: Promise<{ id: string }> };

const METODOS = ["dinheiro", "pix", "debito", "credito"] as const;
type Metodo = (typeof METODOS)[number];

/** Venda de balcão: confirma o pagamento na própria plataforma (dinheiro/pix/cartão presencial). */
export async function POST(req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const { id } = await params;

  const body = (await req.json()) as { metodo?: string; parcelas?: number };
  if (!body.metodo || !METODOS.includes(body.metodo as Metodo)) {
    return NextResponse.json(
      { erro: "metodo inválido (dinheiro | pix | debito | credito)" },
      { status: 400 },
    );
  }
  const metodo = body.metodo as Metodo;

  // Cobrança de matrícula em aberto desta pessoa.
  const cobranca = await prisma.cobranca.findFirst({
    where: { personId: id, status: "pendente" },
    orderBy: { vencimento: "desc" },
  });
  if (!cobranca) {
    return NextResponse.json({ erro: "Nenhuma cobrança pendente para esta pessoa" }, { status: 404 });
  }

  // Registra o método (venda de balcão).
  await prisma.cobranca.update({ where: { id: cobranca.id }, data: { metodo } });

  if (!cobranca.asaasId) {
    // Cobrança sem vínculo no Asaas (ex.: dados de seed): cria uma cadeia de pagamento
    // local (customer → subscription → payment) para que o Payment fique ligado à pessoa
    // e a política de acesso enxergue billingStatus=PAID. Assim o balcão libera o acesso.
    const membership = await prisma.membership.findFirst({
      where: { personId: id },
      orderBy: { matriculadoEm: "desc" },
    });
    const payId = `balcao_pay_${cobranca.id}`;
    const bc = await upsertBillingCustomerRepo({ asaasCustomerId: `balcao_cus_${id}`, personId: id });
    const bs = await upsertBillingSubscriptionRepo({
      asaasSubscriptionId: `balcao_sub_${cobranca.id}`,
      customerId: bc.id,
      value: cobranca.valor,
      externalReference: membership?.id ?? null,
    });
    await upsertPaymentRepo({
      asaasPaymentId: payId,
      subscriptionId: bs.id,
      value: cobranca.valor,
      dueDate: cobranca.vencimento,
      status: "PENDING",
      statusUpdatedAt: new Date(),
    });
    await prisma.cobranca.update({ where: { id: cobranca.id }, data: { asaasId: payId } });
    cobranca.asaasId = payId;
  }

  // Reaproveita o caminho do webhook: marca o Payment PAID, ativa a matrícula e libera o acesso.
  await processarEvento({
    id: `balcao:${cobranca.asaasId}:${Date.now()}`,
    event: "PAYMENT_RECEIVED",
    dateCreated: new Date().toISOString(),
    payment: {
      id: cobranca.asaasId,
      status: "RECEIVED",
      value: cobranca.valor,
      paymentDate: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true, status: "pago", metodo });
}
