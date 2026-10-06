/**
 * Smoke do ciclo de cobrança contra o SANDBOX do Asaas, no banco local.
 *
 * Uso: npx tsx scripts/asaas-smoke.ts [--manter]
 *
 * Cria um aluno de teste e percorre: matrícula (cliente + assinatura +
 * 1ª cobrança aberta para PIX/boleto/cartão) → webhook PAYMENT_CREATED →
 * cobrança avulsa e cancelamento → baixa de balcão → reconciliação →
 * renovação (assinatura anterior cancelada). No fim apaga o que criou no
 * Asaas e no banco (--manter deixa tudo para inspeção).
 *
 * Recusa rodar com ASAAS_ENV=production.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  if (process.env.ASAAS_ENV === "production") throw new Error("smoke só roda no sandbox");
  if (!process.env.ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada");

  // Importa depois do env: o cliente do Asaas lê a URL base no carregamento.
  const asaas = await import("@/lib/asaas");
  const { prisma } = await import("@/lib/db");
  const { matricularPessoa } = await import("@/lib/store");
  const { processarEvento } = await import("@/lib/billing/processor");
  const { reconciliarPayments } = await import("@/lib/billing/reconcile");
  const cobrancas = await import("@/lib/billing/cobrancas");

  const base = "https://api-sandbox.asaas.com/v3";
  const get = async <T>(caminho: string): Promise<T> =>
    (await fetch(`${base}${caminho}`, { headers: { access_token: process.env.ASAAS_API_KEY! } })).json() as Promise<T>;

  const unit = await prisma.unit.findFirstOrThrow();
  const plano = await prisma.plan.findFirstOrThrow({ where: { ativo: true, valorMensal: { gt: 0 } } });
  const sufixo = Date.now().toString(36).toUpperCase();
  const pessoa = await prisma.person.create({
    data: {
      codigo: `SMOKE-${sufixo}`,
      nome: `Smoke Coliseu ${sufixo}`,
      telefone: "11987654321",
      email: `smoke+${sufixo.toLowerCase()}@coliseu.test`,
      cpf: "52998224725", // CPF de teste válido
      origem: "balcao",
      unitId: unit.id,
    },
  });
  console.log(`[smoke] aluno ${pessoa.codigo} · plano ${plano.nome} (${plano.valorMensal})`);
  const criados: { customer?: string; subs: string[] } = { subs: [] };

  try {
    console.log("1. Matrícula");
    const m1 = await asaas.matricularNoAsaas({
      id: pessoa.id, codigo: pessoa.codigo, nome: pessoa.nome, telefone: pessoa.telefone ?? "",
      email: pessoa.email ?? "", cpf: pessoa.cpf ?? "", planoNome: plano.nome,
      valorMensal: plano.valorMensal, personId: pessoa.id,
    });
    criados.customer = m1.customerId;
    criados.subs.push(m1.assinaturaId);
    await matricularPessoa(pessoa.id, plano.id, m1);
    const p1 = await asaas.obterCobrancaAsaas(m1.cobrancaId);
    ok(p1?.billingType === "UNDEFINED", "1ª cobrança aberta para o aluno escolher a forma (UNDEFINED)");
    ok(Boolean(p1?.invoiceUrl), `link da fatura: ${p1?.invoiceUrl}`);

    console.log("2. Webhook PAYMENT_CREATED (payload real)");
    await processarEvento({ id: `smoke:${m1.cobrancaId}`, event: "PAYMENT_CREATED", dateCreated: new Date().toISOString(), payment: p1! });
    const local1 = await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: m1.cobrancaId } });
    ok(local1.personId === pessoa.id && local1.subscriptionId, "cobrança ligada ao aluno e à assinatura");

    console.log("3. Cobrança avulsa + cancelamento");
    const venc = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const av = await cobrancas.gerarCobrancaAvulsaParaPessoa(pessoa.id, { valor: 15, vencimento: venc, descricao: "Smoke: taxa" });
    ok(av.linkPagamento.includes("asaas"), "avulsa criada no Asaas com link");
    await cobrancas.cancelarCobranca(av.asaasPaymentId);
    const avRemota = await get<{ deleted: boolean }>(`/payments/${av.asaasPaymentId}`);
    ok(avRemota.deleted === true, "avulsa removida no Asaas");
    ok((await prisma.cobranca.findFirstOrThrow({ where: { asaasId: av.asaasPaymentId } })).status === "cancelado", "avulsa 'cancelado' na tela");

    console.log("4. Baixa de balcão + reconciliação");
    await cobrancas.baixarNoAsaas(m1.cobrancaId, p1!.value);
    const pago = await asaas.obterCobrancaAsaas(m1.cobrancaId);
    ok(pago?.status === "RECEIVED_IN_CASH", "Asaas registrou o recebimento em dinheiro");
    const rec = await reconciliarPayments([pago!]);
    ok(rec.atualizados === 1, "reconciliação aplicou o status");
    ok((await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: m1.cobrancaId } })).status === "PAID", "cobrança PAID no Coliseu");
    const ms = await prisma.membership.findFirstOrThrow({ where: { personId: pessoa.id }, orderBy: { matriculadoEm: "desc" } });
    ok(ms.status === "ACTIVE", "matrícula ativada");

    console.log("5. Renovação reaproveita o cliente e cancela a assinatura anterior");
    const bc = await prisma.billingCustomer.findUniqueOrThrow({ where: { personId: pessoa.id } });
    const m2 = await asaas.matricularNoAsaas({
      id: pessoa.id, codigo: pessoa.codigo, nome: pessoa.nome, planoNome: plano.nome,
      valorMensal: plano.valorMensal, personId: pessoa.id, customerId: bc.asaasCustomerId,
    });
    criados.subs.push(m2.assinaturaId);
    ok(m2.customerId === m1.customerId, "mesmo cliente no Asaas (sem duplicar)");
    await matricularPessoa(pessoa.id, plano.id, m2);
    await cobrancas.cancelarAssinaturasAnteriores(pessoa.id, m2.assinaturaId);
    const subAntiga = await get<{ deleted: boolean }>(`/subscriptions/${m1.assinaturaId}`);
    ok(subAntiga.deleted === true, "assinatura anterior removida no Asaas");
    const ativas = await prisma.billingSubscription.count({ where: { customer: { personId: pessoa.id }, status: "ACTIVE" } });
    ok(ativas === 1, "só uma assinatura ativa no Coliseu");

    const lista = await cobrancas.listarPagamentosDaPessoa(pessoa.id);
    console.log(`\n[smoke] ficha: ${lista.pagamentos.length} cobranças, assinatura ${lista.assinatura?.asaasId}`);
    console.log("[smoke] TUDO OK");
  } finally {
    if (process.argv.includes("--manter")) {
      console.log(`[smoke] mantido: pessoa ${pessoa.id}, cliente ${criados.customer}`);
    } else {
      for (const s of criados.subs) await asaas.cancelarAssinaturaAsaas(s).catch(() => {});
      if (criados.customer) {
        await fetch(`${base}/customers/${criados.customer}`, {
          method: "DELETE",
          headers: { access_token: process.env.ASAAS_API_KEY! },
        }).catch(() => {});
      }
      await prisma.cobranca.deleteMany({ where: { personId: pessoa.id } });
      await prisma.payment.deleteMany({ where: { personId: pessoa.id } });
      await prisma.person.delete({ where: { id: pessoa.id } }).catch(() => {});
      console.log("[smoke] limpeza feita (Asaas sandbox + banco local)");
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[smoke]", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
