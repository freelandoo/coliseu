import { expect, test } from "vitest";
import { casaPessoa } from "@/lib/busca-pessoa";

const deborah = { nome: "Déborah Lopes", codigo: "CD00933", cpf: "126.817.748-29", telefone: "(11) 95707-3112" };

test("acha por nome sem acento, CPF com ou sem pontos, telefone e código", () => {
  expect(casaPessoa(deborah, "deborah")).toBe(true);
  expect(casaPessoa(deborah, "DEBORAH LO")).toBe(true);
  expect(casaPessoa(deborah, "12681774829")).toBe(true);
  expect(casaPessoa(deborah, "126.817.748-29")).toBe(true);
  expect(casaPessoa(deborah, "95707-3112")).toBe(true);
  expect(casaPessoa(deborah, "cd00933")).toBe(true);
  expect(casaPessoa(deborah, "933")).toBe(true);
});

test("não casa à toa", () => {
  expect(casaPessoa(deborah, "maria")).toBe(false);
  expect(casaPessoa(deborah, "12")).toBe(false);
  expect(casaPessoa({ nome: "Lote", telefone: "11911111111" }, "Lote 999")).toBe(false);
  expect(casaPessoa(deborah, "")).toBe(true);
});
