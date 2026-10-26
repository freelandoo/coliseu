import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { criarPessoaRepo } from "@/lib/repositories/pessoas";
import { CloudgymError, type CgCliente } from "@/lib/cloudgym/api";
import {
  dadosDoCliente,
  formaCloudgym,
  modoEspelho,
  parcelasDoContrato,
  rodarEspelho,
  valorDaBaixa,
  type ApiCloudgym,
} from "@/lib/cloudgym/espelho";

describe("regras do espelho", () => {
  it("forma de baixa: nada aciona gateway, cartão vai com bandeira", () => {
    expect(formaCloudgym("BALCAO:dinheiro")).toEqual({ forma: "DN" });
    expect(formaCloudgym("PIX")).toEqual({ forma: "PIXA" });
    expect(formaCloudgym("BALCAO:pix")).toEqual({ forma: "PIXA" });
    expect(formaCloudgym("BOLETO")).toEqual({ forma: "BL" });
    expect(formaCloudgym("BALCAO:credito")).toEqual({ forma: "ECC", cartao: "outros" });
    expect(formaCloudgym("DEBIT_CARD")).toEqual({ forma: "ECD", cartao: "outros" });
    expect(formaCloudgym("UNDEFINED")).toEqual({ forma: "DN" });
  });

  it("pago a menos vira baixa parcial (com desconto); igual ou a mais, baixa cheia", () => {
    expect(valorDaBaixa(140, 149)).toBe(140);
    expect(valorDaBaixa(149, 149)).toBeUndefined();
    expect(valorDaBaixa(149.001, 149)).toBeUndefined();
    expect(valorDaBaixa(200, 149)).toBeUndefined();
  });

  it("parcelas: boleto parcelado pelo texto, assinatura pelos meses do plano", () => {
    expect(parcelasDoContrato("Parcela 1 de 10. Plano Anual", "INSTALLMENT", { duracaoDias: 365 })).toBe(10);
    expect(parcelasDoContrato(null, "MONTHLY", { duracaoDias: 365 })).toBe(12);
    expect(parcelasDoContrato(null, "MONTHLY", { duracaoDias: 30 })).toBe(1);
  });

  it("modo: ativo sem data de início só simula; depois do corte desliga", () => {
    const antes = { ...process.env };
    process.env.CLOUDGYM_ESPELHO = "ativo";
    delete process.env.CLOUDGYM_ESPELHO_DESDE;
    expect(modoEspelho(new Date("2026-11-01"))).toBe("simular");
    process.env.CLOUDGYM_ESPELHO_DESDE = "2026-10-27T00:00:00-03:00";
    expect(modoEspelho(new Date("2026-11-01"))).toBe("ativo");
    expect(modoEspelho(new Date("2027-02-01"))).toBe("desligado");
    process.env = antes;
  });

  it("cadastro: telefone com +55, campos inválidos ficam de fora", () => {
    const d = dadosDoCliente({
      nome: "Fulana de Tal", codigo: "CD99999", telefone: "(11) 98765-4321", cpf: "123",
      email: "sem-arroba", dataNascimento: "01/02/2000", genero: "F", rua: "Rua A", numero: "10",
    } as never);
    expect(d).toEqual({
      name: "Fulana de Tal", cellPhoneNumber: "+5511987654321", gender: "F", address: "Rua A, 10", extId: "CD99999",
    });
  });
});

/** CloudGym em memória: preço do plano ÷ parcelas, baixa dupla dá 409. */
function cloudgymFalso(precos: Record<number, number>) {
  let seq = 1000;
  const clientes = new Map<number, CgCliente & { cpfBusca?: string }>();
  const chamadas: string[] = [];
  function novoContrato(plano: number, inicio: string, parcelas: number) {
    const id = ++seq;
    const valor = Math.round((precos[plano] / parcelas) * 100) / 100;
    return {
      id, plan: plano, status: "active", creationDate: `${inicio}T00:00:00Z`, startDate: inicio, endDate: inicio,
      payments: Array.from({ length: parcelas }, (_, i) => ({
        id: ++seq, amount: valor, dueDate: `${inicio}-${String(i).padStart(2, "0")}`, status: null as string | null,
      })),
    };
  }
  const api: ApiCloudgym = {
    async obterCliente(id) {
      const c = clientes.get(id);
      if (!c) throw new CloudgymError(404, "não existe");
      return structuredClone(c);
    },
    async buscarPorCpf(cpf) {
      return [...clientes.values()].filter((c) => c.cpf === cpf).map((c) => ({ id: c.id, name: c.name }));
    },
    async criarCliente(dados, k) {
      chamadas.push(`criarCliente ${dados.name} ${k.parcelas}x`);
      const ct = novoContrato(k.plano, k.inicio, k.parcelas);
      const id = ++seq;
      clientes.set(id, { id, name: dados.name, cpf: dados.cpf ?? null, status: "active", contracts: [ct] });
      return { id, contractId: ct.id };
    },
    async criarContrato(memberId, k) {
      chamadas.push(`criarContrato ${memberId} ${k.parcelas}x`);
      const ct = novoContrato(k.plano, k.inicio, k.parcelas);
      clientes.get(memberId)!.contracts.unshift(ct);
      return ct.id;
    },
    async receberParcela(parcelaId, baixa) {
      for (const c of clientes.values())
        for (const ct of c.contracts)
          for (const p of ct.payments)
            if (p.id === parcelaId) {
              if (p.status === "paid") throw new CloudgymError(409, "Payment is already paid.");
              p.status = "paid";
              chamadas.push(`receber ${parcelaId} ${baixa.forma}${baixa.valor !== undefined ? ` ${baixa.valor}` : ""}`);
              return;
            }
      throw new CloudgymError(404, "parcela não existe");
    },
    async cancelarContrato(id) {
      chamadas.push(`cancelar ${id}`);
      for (const c of clientes.values()) for (const ct of c.contracts) if (ct.id === id) ct.status = "canceled";
    },
    async criarPlano(p) {
      const id = ++seq;
      precos[id] = p.price;
      chamadas.push(`criarPlano ${p.name}`);
      return id;
    },
  };
  return { api, clientes, chamadas, novoContrato };
}

describe("rodada do espelho (banco de teste)", () => {
  const DESDE = new Date("2026-10-27T03:00:00Z");
  const k = Date.now();
  const envAntes = { ...process.env };

  beforeEach(async () => {
    process.env.CLOUDGYM_ESPELHO = "ativo";
    process.env.CLOUDGYM_ESPELHO_DESDE = DESDE.toISOString();
    process.env.CLOUDGYM_ESPELHO_ATE = "2099-01-01";
    // Cada teste parte só dos próprios pagamentos.
    await prisma.payment.updateMany({ where: { status: "PAID", paidAt: { gte: DESDE } }, data: { paidAt: new Date("2020-01-01") } });
  });
  afterEach(() => {
    process.env = { ...envAntes };
  });

  async function alunoPagando(opts: { legacy?: number; cpf?: string; matriculadoEm: Date; valor: number; ciclo?: string; descricao?: string }) {
    const p = await criarPessoaRepo({ nome: `Espelho ${k} ${Math.random()}`, origem: "balcao", telefone: "11987654321", cpf: opts.cpf });
    if (opts.legacy) await prisma.person.update({ where: { id: p.id }, data: { legacyCloudgymId: opts.legacy } });
    const plano = await prisma.plan.findUniqueOrThrow({ where: { id: "p-anual" } });
    const m = await prisma.membership.create({
      data: { personId: p.id, planId: plano.id, status: "ACTIVE", matriculadoEm: opts.matriculadoEm, vencimentoPlano: new Date("2027-12-01") },
    });
    const bc = await prisma.billingCustomer.create({ data: { asaasCustomerId: `cus_esp_${p.id}`, personId: p.id } });
    const bs = await prisma.billingSubscription.create({
      data: { asaasSubscriptionId: `sub_esp_${p.id}`, customerId: bc.id, value: opts.valor, cycle: opts.ciclo ?? "MONTHLY" },
    });
    const pagar = (n: number, forma = "PIX") =>
      prisma.payment.create({
        data: {
          asaasPaymentId: `pay_esp_${p.id}_${n}`, subscriptionId: bs.id, personId: p.id, value: opts.valor,
          dueDate: new Date(), status: "PAID", paidAt: new Date(DESDE.getTime() + n * 60_000), billingType: forma,
          descricao: opts.descricao ?? null,
        },
      });
    return { p, m, pagar };
  }

  it("aluno novo: cria cliente + contrato de 12 parcelas no 1º pagamento e dá baixa; o 2º usa o mesmo contrato", async () => {
    // Plano anual da semente não tem id no CloudGym: o espelho cria.
    const cg = cloudgymFalso({});
    const a = await alunoPagando({ matriculadoEm: new Date(DESDE.getTime() + 1000), valor: 79.9 });
    await a.pagar(1);
    let r = await rodarEspelho({ api: cg.api });
    expect(r.erros).toBe(0);
    expect(r.feitos).toBe(1);
    expect(cg.chamadas.filter((c) => c.startsWith("criarCliente"))).toHaveLength(1);
    expect(cg.chamadas.some((c) => /criarCliente .* 12x/.test(c))).toBe(true);

    // Rodar de novo não lança outra vez.
    r = await rodarEspelho({ api: cg.api });
    expect(r.pendentes).toBe(0);

    await a.pagar(2, "BALCAO:dinheiro");
    r = await rodarEspelho({ api: cg.api });
    expect(r.feitos).toBe(1);
    expect(cg.chamadas.filter((c) => c.startsWith("criarContrato") || c.startsWith("criarCliente"))).toHaveLength(1);
    const recebidas = cg.chamadas.filter((c) => c.startsWith("receber"));
    expect(recebidas).toHaveLength(2);
    expect(recebidas[1]).toMatch(/ DN$/);
  });

  it("aluno que veio do CloudGym: baixa na parcela aberta do contrato que já existe lá", async () => {
    const cg = cloudgymFalso({ 777: 1788 });
    const ct = cg.novoContrato(777, "2026-06-09", 12);
    ct.payments[0].status = "paid";
    const legado = 900_000_000 + (k % 100_000_000);
    cg.clientes.set(legado, { id: legado, name: "Antigo", cpf: null, status: "active", contracts: [ct] });
    const plano = await prisma.plan.findUniqueOrThrow({ where: { id: "p-anual" } });
    await prisma.plan.update({ where: { id: plano.id }, data: { legacyCloudgymId: 777 } });
    try {
      const a = await alunoPagando({ legacy: legado, matriculadoEm: new Date("2026-06-09"), valor: 140 });
      await a.pagar(1);
      const r = await rodarEspelho({ api: cg.api });
      expect(r.erros).toBe(0);
      expect(cg.chamadas.some((c) => c.startsWith("criar"))).toBe(false);
      // 1788/12 = 149; pagou 140 → baixa parcial com desconto.
      expect(cg.chamadas).toEqual([`receber ${ct.payments[1].id} PIXA 140`]);
    } finally {
      await prisma.plan.update({ where: { id: plano.id }, data: { legacyCloudgymId: null } });
    }
  });

  it("acha o aluno pelo CPF em vez de duplicar, e cancela o contrato quando a matrícula é cancelada", async () => {
    const cg = cloudgymFalso({});
    const cpf = String(k).slice(-11).padStart(11, "1");
    cg.clientes.set(888, { id: 888, name: "Pelo CPF", cpf, status: "active", contracts: [] });
    const a = await alunoPagando({ cpf, matriculadoEm: new Date(DESDE.getTime() + 1000), valor: 79.9 });
    await a.pagar(1);
    await rodarEspelho({ api: cg.api });
    expect(cg.chamadas.some((c) => c.startsWith("criarCliente"))).toBe(false);
    expect(cg.chamadas.some((c) => c.startsWith("criarContrato 888 12x"))).toBe(true);

    await prisma.membership.update({ where: { id: a.m.id }, data: { status: "CANCELED" } });
    const r = await rodarEspelho({ api: cg.api });
    expect(r.cancelados).toBe(1);
    expect(cg.clientes.get(888)!.contracts[0].status).toBe("canceled");
  });

  it("sem login: para a rodada sem marcar o pagamento como desistido", async () => {
    const cg = cloudgymFalso({});
    cg.api.criarCliente = async () => {
      throw new CloudgymError(401, "Token do CloudGym venceu");
    };
    const a = await alunoPagando({ matriculadoEm: new Date(DESDE.getTime() + 1000), valor: 79.9 });
    const pg = await a.pagar(1);
    const r = await rodarEspelho({ api: cg.api });
    expect(r.erros).toBe(1);
    expect(await prisma.espelhoCloudgym.findUnique({ where: { tipo_localId: { tipo: "pagamento", localId: pg.id } } })).toBeNull();
  });
});
