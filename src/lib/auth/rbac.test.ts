import { expect, test } from "vitest";
import { podeBackup, podeModulo, podePapel, rotaInicial } from "@/lib/auth/modulos";

test("ADMIN pode tudo; RECEPCAO não é TECNICO", () => {
  expect(podePapel("ADMIN", ["ADMIN"])).toBe(true);
  expect(podePapel("ADMIN", ["TECNICO"])).toBe(true);
  expect(podePapel("RECEPCAO", ["TECNICO"])).toBe(false);
  expect(podePapel("RECEPCAO", ["RECEPCAO", "ADMIN"])).toBe(true);
});

test("colaborador só abre matrícula, captação, atendimento e catraca", () => {
  for (const m of ["matriculados", "captacao", "atendimento", "acesso"] as const) {
    expect(podeModulo("RECEPCAO", m)).toBe(true);
  }
  // Painel, dinheiro e indicadores do negócio são do admin.
  for (const m of ["painel", "cobranca", "custos", "relatorios"] as const) {
    expect(podeModulo("RECEPCAO", m)).toBe(false);
    expect(podeModulo("ADMIN", m)).toBe(true);
  }
});

test("a lixeira de conversas é só do desenvolvedor — nem ADMIN entra", () => {
  expect(podeBackup({ desenvolvedor: true })).toBe(true);
  expect(podeBackup({ desenvolvedor: false })).toBe(false);
  expect(podeBackup({})).toBe(false);
  expect(podeBackup(null)).toBe(false);
});

test("quem atende cai no Atendimento; quem não atende, na sua própria tela", () => {
  expect(rotaInicial("ADMIN")).toBe("/atendimento");
  expect(rotaInicial("RECEPCAO")).toBe("/atendimento");
  // Técnico não tem o módulo: mandá-lo para lá seria um looping de redirect.
  expect(rotaInicial("TECNICO")).toBe("/acesso");
});
