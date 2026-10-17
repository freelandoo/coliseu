import { expect, test } from "vitest";
import { podeBackup, podeModulo, podePapel, rotaInicial } from "@/lib/auth/modulos";

test("ADMIN pode tudo; RECEPCAO não é TECNICO", () => {
  expect(podePapel("ADMIN", ["ADMIN"])).toBe(true);
  expect(podePapel("ADMIN", ["TECNICO"])).toBe(true);
  expect(podePapel("RECEPCAO", ["TECNICO"])).toBe(false);
  expect(podePapel("RECEPCAO", ["RECEPCAO", "ADMIN"])).toBe(true);
});

test("colaborador só abre matrícula, captação, aula experimental, atendimento e catraca", () => {
  for (const m of ["matriculados", "captacao", "aula-experimental", "atendimento", "acesso"] as const) {
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

test("admin entra na central; quem atende, no Atendimento; o resto, na sua própria tela", () => {
  expect(rotaInicial("ADMIN")).toBe("/painel");
  expect(rotaInicial("RECEPCAO")).toBe("/atendimento");
  // A central é só do admin: recepção e técnico nunca são mandados para lá.
  expect(podeModulo("RECEPCAO", "painel")).toBe(false);
  expect(podeModulo("TECNICO", "painel")).toBe(false);
  // Técnico não tem o módulo: mandá-lo para lá seria um looping de redirect.
  expect(rotaInicial("TECNICO")).toBe("/acesso");
});
