import { expect, test } from "vitest";
import { avisoDeCarencia, contaComoAtivo, diasDesde, situacaoDoAluno, temContratoVigente } from "@/lib/billing/regua";

// 27/10/2026 às 10h em São Paulo
const AGORA = new Date("2026-10-27T13:00:00Z");

test("dias corridos pelo calendário de São Paulo, não pela hora", () => {
  expect(diasDesde(new Date("2026-10-27T00:00:00Z"), AGORA)).toBe(0);
  expect(diasDesde(new Date("2026-10-26T12:00:00Z"), AGORA)).toBe(1);
  expect(diasDesde(new Date("2026-11-01T00:00:00Z"), AGORA)).toBe(-5);
  // 23h30 de 27/10 em SP já é 28/10 em UTC — ainda é dia 27 na academia
  expect(diasDesde(new Date("2026-10-27T00:00:00Z"), new Date("2026-10-28T02:30:00Z"))).toBe(0);
});

const vigente = { matricula: "ACTIVE" as const, diasAposVencimentoPlano: -100, renovaSozinho: false };
const encerrado = { matricula: "ACTIVE" as const, diasAposVencimentoPlano: 10, renovaSozinho: false };

test("contrato vigente: inadimplente a partir de 8 dias e nunca inativo pela parcela", () => {
  expect(situacaoDoAluno({ ...vigente, diasAtrasoParcela: null })).toBe("ativo");
  expect(situacaoDoAluno({ ...vigente, diasAtrasoParcela: 7 })).toBe("ativo");
  expect(situacaoDoAluno({ ...vigente, diasAtrasoParcela: 8 })).toBe("inadimplente");
  expect(situacaoDoAluno({ ...vigente, diasAtrasoParcela: 300 })).toBe("inadimplente");
  expect(contaComoAtivo({ status: "inadimplente", contratoVigente: true })).toBe(true);
});

test("sem contrato: inadimplente até 60 dias de atraso, depois inativo", () => {
  expect(situacaoDoAluno({ ...encerrado, diasAtrasoParcela: null })).toBe("inativo");
  expect(situacaoDoAluno({ ...encerrado, diasAtrasoParcela: 30 })).toBe("inadimplente");
  expect(situacaoDoAluno({ ...encerrado, diasAtrasoParcela: 60 })).toBe("inadimplente");
  expect(situacaoDoAluno({ ...encerrado, diasAtrasoParcela: 61 })).toBe("inativo");
  expect(situacaoDoAluno({ ...encerrado, matricula: "EXPIRED", diasAtrasoParcela: 20 })).toBe("inadimplente");
  // inadimplente sem contrato não entra no total de ativos
  expect(contaComoAtivo({ status: "inadimplente", contratoVigente: false })).toBe(false);
});

test("contrato vigente: plano na carência ou assinatura que renova sozinha", () => {
  expect(temContratoVigente({ ...encerrado, diasAposVencimentoPlano: 3, diasAtrasoParcela: null })).toBe(true);
  expect(temContratoVigente({ ...encerrado, diasAposVencimentoPlano: 4, diasAtrasoParcela: null })).toBe(false);
  expect(temContratoVigente({ ...encerrado, diasAposVencimentoPlano: 40, renovaSozinho: true, diasAtrasoParcela: null })).toBe(true);
  expect(temContratoVigente({ ...vigente, matricula: "EXPIRED", diasAtrasoParcela: null })).toBe(false);
});

test("aviso da carência para a recepção: 3, 2 e o último dia", () => {
  expect(avisoDeCarencia(0)).toBeNull();
  expect(avisoDeCarencia(1)?.texto).toBe("Matrícula vencida. 3 dias de carência a partir de hoje.");
  expect(avisoDeCarencia(2)?.texto).toBe("Matrícula vencida. Restam 2 dias de carência.");
  expect(avisoDeCarencia(3)?.texto).toBe("Matrícula vencida. Último dia de carência: amanhã o acesso será bloqueado.");
  expect(avisoDeCarencia(4)).toBeNull();
});
