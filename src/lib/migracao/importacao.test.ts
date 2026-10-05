import { describe, expect, test } from "vitest";
import {
  casarComExistentes,
  chavesCheckin,
  IndiceContato,
  instanteSaoPaulo,
  montarClientes,
  montarParcela,
  origemDoColiseu,
  parcelaDeReferencia,
  statusDoPayment,
  type ClienteCG,
  type Issue,
  type Linha,
  type ParcelaCG,
} from "@/lib/migracao/importacao";

const CPF_A = "52998224725";
const CPF_B = "08150858008";

function linhaCliente(o: Partial<Linha>): Linha {
  return {
    id: "1", name: "Fulano", cpf: "", email: "", cellPhoneNumber: "", phoneNumber: "", gender: "M",
    birthDay: "", city: "", state: "", zipCode: "", source: "", salesRep: "", nps: "", rg: "",
    creationDate: "2020-01-01", startDate: "2026-01-01", endDate: "2026-12-31", plan: "", status: "active",
    ...o,
  } as Linha;
}

describe("montarClientes", () => {
  test("ativo prevalece sobre inativo com o mesmo id", () => {
    const issues: Issue[] = [];
    const r = montarClientes(
      [linhaCliente({ id: "7", name: "ATIVO" })],
      [linhaCliente({ id: "7", name: "INATIVO" }), linhaCliente({ id: "8", name: "SÓ INATIVO" })],
      "2026-10-05",
      issues,
    );
    expect(r).toHaveLength(2);
    expect(r.find((c) => c.legacyId === 7)).toMatchObject({ ativo: true, nome: "Ativo" });
    expect(r.find((c) => c.legacyId === 8)?.ativo).toBe(false);
  });

  test("dado inválido vira null e issue, sem derrubar a linha", () => {
    const issues: Issue[] = [];
    const [c] = montarClientes(
      [linhaCliente({ id: "9", cpf: "123", email: "x@", birthDay: "8198-10-02", plan: "A| B |" })],
      [],
      "2026-10-05",
      issues,
    );
    expect(c).toMatchObject({ cpf: null, email: null, nascimento: null, planos: ["A", "B"] });
    expect(issues.map((i) => i.motivo).sort()).toEqual(["cpf_invalido", "email_invalido", "nascimento_invalido"]);
  });

  test("normaliza nome, telefone e cidade e guarda o nome original", () => {
    const [c] = montarClientes(
      [linhaCliente({ id: "3", name: "SARA  LIMA", cellPhoneNumber: "(11) 98765-4321", city: "SAO BERNARDO DO CAMPO", cpf: CPF_A })],
      [],
      "2026-10-05",
      [],
    );
    expect(c).toMatchObject({ nome: "Sara Lima", legacyName: "SARA  LIMA", celular: "+5511987654321", cidade: "São Bernardo do Campo", cpf: CPF_A });
  });

  test("origem do CloudGym vira o enum do Coliseu", () => {
    expect(origemDoColiseu("indication")).toBe("indicacao");
    expect(origemDoColiseu("instagram")).toBe("redes");
    expect(origemDoColiseu("email")).toBe("balcao");
    expect(origemDoColiseu("")).toBe("balcao");
  });
});

describe("IndiceContato", () => {
  const idx = new IndiceContato([
    { id: "a", email: "ana@x.com", celular: "(11) 91111-1111", nome: "Ana Souza" },
    { id: "b", email: "bia@x.com", celular: "(11) 92222-2222", nome: "João Silva" },
    { id: "c", email: "", celular: "", nome: "João Silva" }, // homônimo
  ]);

  test("ordem email → celular → nome", () => {
    expect(idx.achar("ANA@x.com ", "", "")).toEqual({ id: "a", via: "email" });
    expect(idx.achar("", "+5511922222222", "")).toEqual({ id: "b", via: "celular" });
    expect(idx.achar("", "", "ana  SOUZA")).toEqual({ id: "a", via: "nome" });
  });
  test("nome ambíguo não casa", () => {
    expect(idx.achar("", "", "Joao Silva")).toBeNull();
  });
});

describe("casarComExistentes", () => {
  const cliente = (o: Partial<ClienteCG>): ClienteCG =>
    ({ legacyId: 1, ativo: true, nome: "X", legacyName: "X", cpf: null, celular: null, ...o }) as ClienteCG;

  test("CPF só casa com o primeiro nome batendo (dependente usa CPF do titular)", () => {
    const m = casarComExistentes(
      [cliente({ legacyId: 1, legacyName: "Maria Sousa", cpf: CPF_A }), cliente({ legacyId: 2, legacyName: "Clara Sousa", cpf: CPF_A })],
      [{ id: "p1", legacyCloudgymId: null, cpf: CPF_A, nome: "MARIA SOUSA", telefone: null }],
    );
    expect(m.get(1)).toEqual({ personId: "p1", via: "cpf" });
    expect(m.has(2)).toBe(false);
  });

  test("sem CPF, casa por celular + primeiro nome e depois por nome único", () => {
    const m = casarComExistentes(
      [
        cliente({ legacyId: 1, legacyName: "Pedro Alves", celular: "+5511933333333" }),
        cliente({ legacyId: 2, legacyName: "Rita de Cassia" }),
      ],
      [
        { id: "p1", legacyCloudgymId: null, cpf: null, nome: "Pedro A.", telefone: "(11) 93333-3333" },
        { id: "p2", legacyCloudgymId: null, cpf: null, nome: "Rita de Cássia", telefone: null },
      ],
    );
    expect(m.get(1)).toEqual({ personId: "p1", via: "celular+nome" });
    expect(m.get(2)).toEqual({ personId: "p2", via: "nome" });
  });

  test("id legado vence tudo e cada pessoa casa com um cliente só", () => {
    const m = casarComExistentes(
      [cliente({ legacyId: 5, legacyName: "Ana", cpf: CPF_B }), cliente({ legacyId: 6, legacyName: "Ana", cpf: CPF_B, ativo: false })],
      [{ id: "p1", legacyCloudgymId: 5, cpf: CPF_B, nome: "Ana", telefone: null }],
    );
    expect(m.get(5)).toEqual({ personId: "p1", via: "legacy" });
    expect(m.has(6)).toBe(false);
  });
});

describe("parcelas", () => {
  const base: Linha = {
    payment_id: "100", member_id: "7", data_vencimento: "2026-09-10", data_pagamento: "2026-09-10",
    valor_bruto: "109", valor_liquido: "105.5", forma_pagamento: "CC", numero_cartao: "5502********1234",
    bandeira: "mastercard", nsu_autorizacao: "", data_compensacao: "2026-10-10", campo_15: "stone", status: "paid", tipo: "i",
  };

  test("monta a parcela com cartão mascarado, gateway e tipo", () => {
    const p = montarParcela(base, 2, new Set(["100"]), []);
    expect(p).toMatchObject({
      legacyPaymentId: 100, valorBrutoCent: 10900, valorLiquidoCent: 10550, forma: "CC",
      cartaoFinal: "1234", gateway: "stone", tipo: "mensalidade", realizadoCaixa: true,
    });
  });

  test("forma desconhecida é mantida e registrada", () => {
    const issues: Issue[] = [];
    expect(montarParcela({ ...base, forma_pagamento: "ZZ" }, 2, new Set(), issues)?.forma).toBe("ZZ");
    expect(issues[0].motivo).toBe("forma_desconhecida");
  });

  test("sem vencimento ou valor, a linha cai e vira issue", () => {
    const issues: Issue[] = [];
    expect(montarParcela({ ...base, data_vencimento: "0002-02-19" }, 2, new Set(), issues)).toBeNull();
    expect(issues[0].motivo).toBe("parcela_invalida");
  });
});

describe("parcela de referência para a catraca", () => {
  const p = (o: Partial<ParcelaCG>): ParcelaCG => ({ legacyPaymentId: 1, vencimento: "2026-09-10", pagamento: null, status: null, ...o }) as ParcelaCG;
  const HOJE = "2026-10-05";

  test("pega a vencida mais recente, ignorando estorno e erro", () => {
    const r = parcelaDeReferencia(
      [
        p({ legacyPaymentId: 1, vencimento: "2026-08-10", status: "paid", pagamento: "2026-08-10" }),
        p({ legacyPaymentId: 2, vencimento: "2026-09-10", status: "canceled" }),
        p({ legacyPaymentId: 3, vencimento: "2026-09-12", status: "error" }),
        p({ legacyPaymentId: 4, vencimento: "2026-11-10" }),
      ],
      HOJE,
    );
    expect(r?.legacyPaymentId).toBe(1);
  });

  test("sem nenhuma vencida, usa a próxima a vencer", () => {
    const r = parcelaDeReferencia([p({ legacyPaymentId: 9, vencimento: "2026-12-01" }), p({ legacyPaymentId: 8, vencimento: "2026-11-01" })], HOJE);
    expect(r?.legacyPaymentId).toBe(8);
  });

  test("status do Payment: pago, atrasado ou pendente", () => {
    expect(statusDoPayment(p({ pagamento: "2026-09-10" }), HOJE)).toBe("PAID");
    expect(statusDoPayment(p({ vencimento: "2026-09-10" }), HOJE)).toBe("OVERDUE");
    expect(statusDoPayment(p({ vencimento: "2026-11-10" }), HOJE)).toBe("PENDING");
  });
});

describe("check-ins", () => {
  test("chave determinística com ordinal para repetição no mesmo minuto", () => {
    const l = (hora: string, nome = "Ana") => ({ data: "2026-10-03", hora, nome }) as Linha;
    expect(chavesCheckin([l("12:20:00"), l("12:20:00"), l("12:21:00"), l("12:20:00", "ANA")])).toEqual([
      "2026-10-03|12:20:00|ana",
      "2026-10-03|12:20:00|ana|1",
      "2026-10-03|12:21:00|ana",
      "2026-10-03|12:20:00|ana|2",
    ]);
  });
  test("data + hora em America/Sao_Paulo", () => {
    expect(instanteSaoPaulo("2026-10-03", "12:20:00")?.toISOString()).toBe("2026-10-03T15:20:00.000Z");
    expect(instanteSaoPaulo("2026-10-03", "")).toBeNull();
  });
});
