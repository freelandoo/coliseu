import { expect, test } from "vitest";
import { listarCobrancasRepo, marcarCobrancaPagaRepo } from "@/lib/repositories/cobrancas";
import { listarDespesasRepo, totalDespesasRepo } from "@/lib/repositories/despesas";

test("listarCobrancasRepo devolve cobranças seedadas", async () => {
  const cs = await listarCobrancasRepo();
  expect(cs.length).toBeGreaterThanOrEqual(7);
});

test("marcarCobrancaPagaRepo marca por asaasId", async () => {
  const ok = await marcarCobrancaPagaRepo("pay_002");
  expect(ok).toBe(true);
});

test("totalDespesasRepo soma as despesas", async () => {
  const total = await totalDespesasRepo();
  expect(total).toBeGreaterThan(0);
});
