import { beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { matricularNoAsaas } from "@/lib/asaas";
import { matricularPessoaRepo } from "@/lib/repositories/pessoas";
import { confirmarVendaBalcao, rotuloDaDuracao, vendaDeBalcao } from "@/lib/billing/balcao";

let unitId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
});

async function matricular(codigo: string, duracaoDias: number) {
  const plano = await prisma.plan.create({
    data: { nome: `Plano ${codigo}`, valorMensal: 129.9, duracaoDias, unitId },
  });
  const p = await prisma.person.create({
    data: { codigo, nome: `Teste ${codigo}`, origem: "balcao", fase: "lead", unitId },
  });
  const asaas = await matricularNoAsaas({
    id: p.id, codigo, nome: p.nome, planoNome: plano.nome, valorMensal: plano.valorMensal, personId: p.id,
  });
  await matricularPessoaRepo(p.id, plano.id, asaas);
  return p;
}

test("rótulo da duração", () => {
  expect(rotuloDaDuracao(30)).toBe("Mensal");
  expect(rotuloDaDuracao(90)).toBe("Trimestral");
  expect(rotuloDaDuracao(180)).toBe("Semestral");
  expect(rotuloDaDuracao(365)).toBe("Anual");
});

test("semestral no balcão cobra mensalidade × 6 e para a assinatura", async () => {
  const p = await matricular("TBAL01", 180);
  const venda = await vendaDeBalcao(p.id);
  expect(venda).toMatchObject({ planoInteiro: true, valor: 779.4, valorMensal: 129.9, meses: 6, rotulo: "Semestral" });

  await confirmarVendaBalcao(p.id, "credito");

  const cob = await prisma.cobranca.findFirstOrThrow({ where: { personId: p.id, tipo: "matricula" } });
  expect(cob).toMatchObject({ status: "pago", valor: 779.4, metodo: "credito" });
  const pago = await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: cob.asaasId! } });
  expect(pago).toMatchObject({ status: "PAID", value: 779.4, personId: p.id });
  const assinaturas = await prisma.billingSubscription.findMany({ where: { customer: { personId: p.id } } });
  expect(assinaturas.every((s) => s.status === "CANCELED")).toBe(true);
  const m = await prisma.membership.findFirstOrThrow({ where: { personId: p.id } });
  expect(m.status).toBe("ACTIVE");
  expect(await vendaDeBalcao(p.id)).toBeNull();
});

test("anual no balcão cobra mensalidade × 12", async () => {
  const p = await matricular("TBAL02", 365);
  expect((await vendaDeBalcao(p.id))?.valor).toBe(1558.8);
});

test("mensal no balcão segue cobrando a mensalidade", async () => {
  const p = await matricular("TBAL03", 30);
  const venda = await vendaDeBalcao(p.id);
  expect(venda).toMatchObject({ planoInteiro: false, valor: 129.9, rotulo: "Mensal" });
  await confirmarVendaBalcao(p.id, "dinheiro");
  const cob = await prisma.cobranca.findFirstOrThrow({ where: { personId: p.id, tipo: "matricula" } });
  expect(cob).toMatchObject({ status: "pago", valor: 129.9 });
});
