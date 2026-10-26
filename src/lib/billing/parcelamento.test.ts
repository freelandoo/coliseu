import { describe, expect, it } from "vitest";
import {
  aceitaParcelamento,
  lerFormaCobranca,
  mesesDoPlano,
  opcoesDeParcelas,
  valorTotalDoPlano,
} from "@/lib/billing/parcelamento";

const anual = { valorMensal: 129.9, duracaoDias: 365 };
const mensal = { valorMensal: 149.9, duracaoDias: 30 };

describe("parcelamento", () => {
  it("meses e valor total saem da vigência", () => {
    expect(mesesDoPlano(30)).toBe(1);
    expect(mesesDoPlano(90)).toBe(3);
    expect(mesesDoPlano(180)).toBe(6);
    expect(mesesDoPlano(365)).toBe(12);
    expect(mesesDoPlano(7)).toBe(1);
    expect(valorTotalDoPlano(anual)).toBe(1558.8);
  });

  it("só plano de mais de um mês parcela, até um boleto por mês", () => {
    expect(aceitaParcelamento(mensal)).toBe(false);
    expect(aceitaParcelamento(anual)).toBe(true);
    expect(opcoesDeParcelas({ duracaoDias: 90 })).toEqual([1, 2, 3]);
  });

  it("sem forma escolhida, segue a assinatura mensal", () => {
    expect(lerFormaCobranca(undefined, anual)).toEqual({ ok: true, forma: { tipo: "assinatura" } });
  });

  it("aceita parcelas dentro da vigência e recusa o resto", () => {
    expect(lerFormaCobranca({ tipo: "boleto_parcelado", parcelas: 12 }, anual)).toEqual({
      ok: true,
      forma: { tipo: "boleto_parcelado", parcelas: 12 },
    });
    expect(lerFormaCobranca({ tipo: "boleto_parcelado", parcelas: 13 }, anual).ok).toBe(false);
    expect(lerFormaCobranca({ tipo: "boleto_parcelado", parcelas: 0 }, anual).ok).toBe(false);
    expect(lerFormaCobranca({ tipo: "boleto_parcelado", parcelas: 2.5 }, anual).ok).toBe(false);
    expect(lerFormaCobranca({ tipo: "boleto_parcelado", parcelas: 1 }, mensal).ok).toBe(false);
    expect(lerFormaCobranca({ tipo: "pix" }, anual).ok).toBe(false);
  });
});

describe("plano gratuito", () => {
  it("R$ 0 não cobra nem parcela", async () => {
    const { ehPlanoGratuito } = await import("@/lib/billing/parcelamento");
    expect(ehPlanoGratuito({ valorMensal: 0 })).toBe(true);
    expect(ehPlanoGratuito({ valorMensal: 79.9 })).toBe(false);
    expect(aceitaParcelamento({ duracaoDias: 365, valorMensal: 0 })).toBe(false);
  });
});
