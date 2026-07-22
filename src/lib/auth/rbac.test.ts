import { expect, test } from "vitest";
import { podeModulo, podePapel, rotaInicial } from "@/lib/auth/modulos";

test("ADMIN pode tudo; RECEPCAO não é TECNICO", () => {
  expect(podePapel("ADMIN", ["ADMIN"])).toBe(true);
  expect(podePapel("ADMIN", ["TECNICO"])).toBe(true);
  expect(podePapel("RECEPCAO", ["TECNICO"])).toBe(false);
  expect(podePapel("RECEPCAO", ["RECEPCAO", "ADMIN"])).toBe(true);
});

test("colaborador só abre matrícula, captação e catraca", () => {
  for (const m of ["matriculados", "captacao", "acesso"] as const) {
    expect(podeModulo("RECEPCAO", m)).toBe(true);
  }
  // Painel, dinheiro e indicadores do negócio são do admin.
  for (const m of ["painel", "cobranca", "custos", "relatorios"] as const) {
    expect(podeModulo("RECEPCAO", m)).toBe(false);
    expect(podeModulo("ADMIN", m)).toBe(true);
  }
});

test("tela inicial segue o papel", () => {
  expect(rotaInicial("ADMIN")).toBe("/painel");
  expect(rotaInicial("RECEPCAO")).toBe("/matriculados");
  expect(rotaInicial("TECNICO")).toBe("/acesso");
});
