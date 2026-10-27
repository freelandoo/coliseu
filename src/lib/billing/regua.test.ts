import { expect, test } from "vitest";
import { avisoDeCarencia, diasDesde, etapaDaCobranca, situacaoDoAluno } from "@/lib/billing/regua";

// 27/10/2026 às 10h em São Paulo
const AGORA = new Date("2026-10-27T13:00:00Z");

test("dias corridos pelo calendário de São Paulo, não pela hora", () => {
  expect(diasDesde(new Date("2026-10-27T00:00:00Z"), AGORA)).toBe(0);
  expect(diasDesde(new Date("2026-10-26T12:00:00Z"), AGORA)).toBe(1);
  expect(diasDesde(new Date("2026-11-01T00:00:00Z"), AGORA)).toBe(-5);
  // 23h30 de 27/10 em SP já é 28/10 em UTC — ainda é dia 27 na academia
  expect(diasDesde(new Date("2026-10-27T00:00:00Z"), new Date("2026-10-28T02:30:00Z"))).toBe(0);
});

test("etapas da régua", () => {
  expect(etapaDaCobranca(null)).toBe("em_dia");
  expect(etapaDaCobranca(0)).toBe("em_dia");
  expect(etapaDaCobranca(1)).toBe("cobranca_automatica");
  expect(etapaDaCobranca(7)).toBe("cobranca_automatica");
  expect(etapaDaCobranca(8)).toBe("inadimplente");
  expect(etapaDaCobranca(60)).toBe("inadimplente");
  expect(etapaDaCobranca(61)).toBe("inativo");
});

test("situação: inadimplente só de 8 a 60 dias; depois inativo", () => {
  const base = { matricula: "ACTIVE" as const, diasAposVencimentoPlano: -100, renovaSozinho: false };
  expect(situacaoDoAluno({ ...base, diasAtrasoParcela: 5 })).toBe("ativo");
  expect(situacaoDoAluno({ ...base, diasAtrasoParcela: 8 })).toBe("inadimplente");
  expect(situacaoDoAluno({ ...base, diasAtrasoParcela: 61 })).toBe("inativo");
  expect(situacaoDoAluno({ ...base, matricula: "EXPIRED", diasAtrasoParcela: null })).toBe("inativo");
});

test("plano vencido além da carência é inativo, salvo assinatura que renova sozinha", () => {
  const base = { matricula: "ACTIVE" as const, diasAtrasoParcela: null };
  expect(situacaoDoAluno({ ...base, diasAposVencimentoPlano: 3, renovaSozinho: false })).toBe("ativo");
  expect(situacaoDoAluno({ ...base, diasAposVencimentoPlano: 4, renovaSozinho: false })).toBe("inativo");
  expect(situacaoDoAluno({ ...base, diasAposVencimentoPlano: 40, renovaSozinho: true })).toBe("ativo");
});

test("aviso da carência para a recepção: 3, 2 e o último dia", () => {
  expect(avisoDeCarencia(0)).toBeNull();
  expect(avisoDeCarencia(1)?.texto).toBe("Matrícula vencida. 3 dias de carência a partir de hoje.");
  expect(avisoDeCarencia(2)?.texto).toBe("Matrícula vencida. Restam 2 dias de carência.");
  expect(avisoDeCarencia(3)?.texto).toBe("Matrícula vencida. Último dia de carência: amanhã o acesso será bloqueado.");
  expect(avisoDeCarencia(4)).toBeNull();
});
