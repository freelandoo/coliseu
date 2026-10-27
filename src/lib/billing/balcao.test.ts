import { beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { matricularNoAsaas } from "@/lib/asaas";
import { matricularPessoaRepo } from "@/lib/repositories/pessoas";
import { confirmarVendaBalcao, rotuloDaDuracao, vendaDeBalcao } from "@/lib/billing/balcao";
import { dividirEmParcelas } from "@/lib/billing/parcelamento";

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

test("dividir em parcelas fecha o total em centavos", () => {
  expect(dividirEmParcelas(1155, 15)).toEqual(Array(15).fill(77));
  const tres = dividirEmParcelas(100, 3);
  expect(tres).toEqual([33.34, 33.33, 33.33]);
});

test("anual parcelado no balcão: paga a 1ª agora, as outras ficam uma por mês", async () => {
  const p = await matricular("TBAL04", 365);
  const r = await confirmarVendaBalcao(p.id, "pix", 12);
  expect(r).toMatchObject({ valorPago: 129.9, parcelas: 12 });

  const pagamentos = await prisma.payment.findMany({ where: { personId: p.id, asaasPaymentId: { startsWith: "balcao_parc_" } }, orderBy: { dueDate: "asc" } });
  expect(pagamentos).toHaveLength(12);
  expect(pagamentos[0]).toMatchObject({ status: "PAID", value: 129.9, descricao: "Parcela 1 de 12 · Anual no balcão" });
  expect(pagamentos.slice(1).every((x) => x.status === "PENDING")).toBe(true);
  expect(pagamentos.reduce((s, x) => s + x.value, 0)).toBeCloseTo(1558.8, 2);
  expect((await prisma.membership.findFirstOrThrow({ where: { personId: p.id } })).status).toBe("ACTIVE");

  // mês seguinte: o balcão oferece a 2ª parcela
  const proxima = await vendaDeBalcao(p.id);
  expect(proxima).toMatchObject({ valor: 129.9, parcela: { numero: 2, de: 12 }, planoInteiro: false });
  await confirmarVendaBalcao(p.id, "dinheiro");
  expect((await vendaDeBalcao(p.id))?.parcela).toEqual({ numero: 3, de: 12 });
});

test("parcelas acima dos meses do plano são recusadas", async () => {
  const p = await matricular("TBAL05", 90);
  await expect(confirmarVendaBalcao(p.id, "pix", 4)).rejects.toThrow("Parcelas devem ir de 1 a 3.");
});

test("mensal no balcão segue cobrando a mensalidade", async () => {
  const p = await matricular("TBAL03", 30);
  const venda = await vendaDeBalcao(p.id);
  expect(venda).toMatchObject({ planoInteiro: false, valor: 129.9, rotulo: "Mensal" });
  await confirmarVendaBalcao(p.id, "dinheiro");
  const cob = await prisma.cobranca.findFirstOrThrow({ where: { personId: p.id, tipo: "matricula" } });
  expect(cob).toMatchObject({ status: "pago", valor: 129.9 });
});
