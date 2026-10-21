import { describe, expect, test } from "vitest";
import type { AccessContext } from "@/lib/access/types";
import {
  avaliarElegibilidade,
  idadeEm,
  matriculaValida,
  nascimentoIso,
  telefoneComDdi,
  type PessoaElegibilidade,
} from "@/lib/freelandoo/elegibilidade";

const AGORA = new Date("2026-10-20T15:00:00Z");

const ctxAtivo: AccessContext = {
  membershipStatus: "ACTIVE", billingStatus: "PAID", diasAtraso: 0, graceDays: 5,
  courtesyEntriesLeft: 0, temCredencialEnrolled: false, sincronizado: false,
  overrideAtivo: null, agora: AGORA, diasAposVencimentoPlano: -10,
};

const aluno = (extra: Partial<PessoaElegibilidade> = {}): PessoaElegibilidade => ({
  id: "p1", nome: "  Maria Souza ", fase: "aluno", cpf: "529.982.247-25", email: "Maria@Exemplo.com ",
  dataNascimento: "1990-07-30", telefone: "(11) 98888-7777", freelandooUserId: null, ...extra,
});

describe("avaliarElegibilidade", () => {
  test("aluno completo e em dia: elegível, com os dados normalizados para a API", () => {
    const r = avaliarElegibilidade(aluno(), ctxAtivo, AGORA);
    expect(r).toEqual({
      elegivel: true,
      dados: {
        cpf: "52998224725", nome: "Maria Souza", email: "maria@exemplo.com",
        data_nascimento: "1990-07-30", telefone: "5511988887777", ref_externa: "p1",
      },
    });
  });

  test("sem telefone válido continua elegível (só não manda a mensagem)", () => {
    const r = avaliarElegibilidade(aluno({ telefone: "123" }), ctxAtivo, AGORA);
    expect(r.elegivel).toBe(true);
    if (r.elegivel) expect(r.dados.telefone).toBeUndefined();
  });

  test.each([
    ["ja_vinculado", aluno({ freelandooUserId: "u9" }), ctxAtivo, null],
    ["nao_e_aluno", aluno({ fase: "lead" }), ctxAtivo, "sem_conta"],
    ["nao_e_aluno", aluno({ fase: "exaluno" }), ctxAtivo, "sem_conta"],
    ["matricula_invalida", aluno(), null, "sem_conta"],
    ["matricula_invalida", aluno(), { ...ctxAtivo, membershipStatus: "CANCELED" as const }, "sem_conta"],
    ["falta_cpf", aluno({ cpf: null }), ctxAtivo, "falta_dado"],
    ["falta_cpf", aluno({ cpf: "  " }), ctxAtivo, "falta_dado"],
    ["cpf_invalido", aluno({ cpf: "529.982.247-24" }), ctxAtivo, "falta_dado"],
    ["cpf_invalido", aluno({ cpf: "111.111.111-11" }), ctxAtivo, "falta_dado"],
    ["falta_email", aluno({ email: null }), ctxAtivo, "falta_dado"],
    ["falta_email", aluno({ email: "sem-arroba" }), ctxAtivo, "falta_dado"],
    ["falta_nascimento", aluno({ dataNascimento: null }), ctxAtivo, "falta_dado"],
    ["falta_nascimento", aluno({ dataNascimento: "31/02/1990" }), ctxAtivo, "falta_dado"],
    ["menor", aluno({ dataNascimento: "2010-01-01" }), ctxAtivo, "menor"],
  ] as const)("%s", (motivo, pessoa, ctx, estado) => {
    expect(avaliarElegibilidade(pessoa, ctx, AGORA)).toEqual({ elegivel: false, motivo, estado });
  });

  test("CPF guardado sem o zero à esquerda é completado", () => {
    // 012.345.678-90 é válido; a base importada às vezes perdeu o zero
    const r = avaliarElegibilidade(aluno({ cpf: "1234567890" }), ctxAtivo, AGORA);
    expect(r.elegivel).toBe(true);
    if (r.elegivel) expect(r.dados.cpf).toBe("01234567890");
  });

  test("faz 18 anos hoje: elegível; amanhã: ainda menor", () => {
    expect(avaliarElegibilidade(aluno({ dataNascimento: "2008-10-20" }), ctxAtivo, AGORA).elegivel).toBe(true);
    expect(avaliarElegibilidade(aluno({ dataNascimento: "2008-10-21" }), ctxAtivo, AGORA)).toMatchObject({
      motivo: "menor",
    });
  });
});

describe("matriculaValida — mesma regra da catraca, só contrato e financeiro", () => {
  test("face e sincronização não importam", () => {
    expect(matriculaValida({ ...ctxAtivo, temCredencialEnrolled: false, sincronizado: false })).toBe(true);
  });
  test("override manual não conta (nem ALLOW nem BLOCK)", () => {
    expect(matriculaValida({ ...ctxAtivo, overrideAtivo: "BLOCK" })).toBe(true);
    expect(matriculaValida({ ...ctxAtivo, membershipStatus: "EXPIRED", overrideAtivo: "ALLOW" })).toBe(false);
  });
  test("recém-matriculado com cortesia é aluno", () => {
    expect(matriculaValida({ ...ctxAtivo, membershipStatus: "PENDING_PAYMENT", billingStatus: "PENDING", courtesyEntriesLeft: 1 })).toBe(true);
  });
  test("inadimplente além da carência não é", () => {
    expect(matriculaValida({ ...ctxAtivo, billingStatus: "OVERDUE", diasAtraso: 30 })).toBe(false);
  });
  test("adotado do CloudGym sem cobrança, plano em dia", () => {
    expect(matriculaValida({ ...ctxAtivo, billingStatus: null, diasAposVencimentoPlano: -3 })).toBe(true);
  });
});

describe("normalizações", () => {
  test("nascimento: ISO, ISO com hora e DD/MM/AAAA", () => {
    expect(nascimentoIso("1990-07-30")).toBe("1990-07-30");
    expect(nascimentoIso("1990-07-30T00:00:00.000Z")).toBe("1990-07-30");
    expect(nascimentoIso("30/07/1990")).toBe("1990-07-30");
    expect(nascimentoIso("1990/07/30")).toBeNull();
    expect(nascimentoIso("1800-01-01")).toBeNull();
    expect(nascimentoIso("")).toBeNull();
  });

  test("idade no fuso da academia", () => {
    // 21/10 00:30 em UTC ainda é 20/10 em São Paulo
    expect(idadeEm("2008-10-21", new Date("2026-10-21T00:30:00Z"))).toBe(17);
    expect(idadeEm("2008-10-21", new Date("2026-10-21T12:00:00Z"))).toBe(18);
  });

  test("telefone com DDI 55", () => {
    expect(telefoneComDdi("(11) 98888-7777")).toBe("5511988887777");
    expect(telefoneComDdi("+55 11 98888-7777")).toBe("5511988887777");
    expect(telefoneComDdi("1133334444")).toBe("551133334444");
    expect(telefoneComDdi("98888-7777")).toBeNull();
    expect(telefoneComDdi(null)).toBeNull();
  });
});
