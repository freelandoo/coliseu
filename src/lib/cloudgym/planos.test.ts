import { expect, test } from "vitest";
import { duracaoDiasCloudgym, mensalidadeCloudgym } from "@/lib/cloudgym/planos";

const p = (price: number, months: number, duration: number, type = "std") => ({ price, months, duration, type });

test("mensalidade pelos dois jeitos do CloudGym", () => {
  expect(mensalidadeCloudgym(p(1788, 1, 12))).toEqual({ valorMensal: 149, leitura: "por_cobranca" });
  expect(mensalidadeCloudgym(p(140, 12, 12))).toEqual({ valorMensal: 140, leitura: "por_cobranca" });
  expect(mensalidadeCloudgym(p(259, 1, 1))).toEqual({ valorMensal: 259, leitura: "por_cobranca" });
  expect(mensalidadeCloudgym(p(1968, 12, 12))).toEqual({ valorMensal: 164, leitura: "total" });
  expect(mensalidadeCloudgym(p(1209, 6, 6))).toEqual({ valorMensal: 201.5, leitura: "total" });
  expect(mensalidadeCloudgym(p(123.24, 10, 12)).valorMensal).toBe(102.7);
  expect(mensalidadeCloudgym(p(1044, 6, 1))).toEqual({ valorMensal: 174, leitura: "por_parcela" });
  expect(mensalidadeCloudgym(p(25, 1, 1, "day"))).toEqual({ valorMensal: 25, leitura: "diaria" });
});

test("vigência em dias", () => {
  expect(duracaoDiasCloudgym({ duration: 12, type: "std" })).toBe(365);
  expect(duracaoDiasCloudgym({ duration: 15, type: "std" })).toBe(450);
  expect(duracaoDiasCloudgym({ duration: 1, type: "day" })).toBe(1);
});
