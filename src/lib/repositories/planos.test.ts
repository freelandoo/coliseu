import { expect, test } from "vitest";
import { listarPlanosRepo, planoPorIdRepo } from "@/lib/repositories/planos";

test("listarPlanosRepo devolve os planos seedados", async () => {
  const planos = await listarPlanosRepo();
  expect(planos.length).toBeGreaterThanOrEqual(4);
  expect(planos.find((p) => p.id === "p-mensal")?.valorMensal).toBe(129.9);
});

test("planoPorIdRepo encontra por id", async () => {
  const p = await planoPorIdRepo("p-anual");
  expect(p?.nome).toBe("Anual");
});
