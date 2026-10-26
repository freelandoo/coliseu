import { describe, expect, it } from "vitest";
import { MODELO_CONTRATO } from "@/lib/contrato/modelo-padrao";
import { idade, limparHtmlContrato, preencherContrato, type DadosContrato } from "@/lib/contrato/preencher";

const base: DadosContrato = {
  nome: "Deborah Lopes",
  rg: "19161198",
  cpf: "12681774829",
  endereco: "Rua Rio Branco, 427 - São Bernardo do Campo - SP",
  inicio: new Date("2026-10-26T15:00:00Z"),
  fim: new Date("2027-10-26T15:00:00Z"),
  plano: "BOXE",
  meses: 12,
  valorTotal: 1788,
  parcelas: 12,
  valorParcela: 149,
  formaPagamento: "Boleto parcelado",
  hoje: new Date("2026-10-26T15:00:00Z"),
  menor: false,
};

describe("contrato", () => {
  it("preenche todos os campos do modelo da academia", () => {
    const html = preencherContrato(MODELO_CONTRATO, base);
    expect(html).not.toMatch(/\{(nome|rg|cpf|endereco|inicio|fim|plano|valortotal|parcelas|valor|metodo_pagamento|data|empresa|respons.vel)\}/);
    expect(html).toContain("DEBORAH LOPES");
    expect(html).toContain("126.817.748-29");
    expect(html).toContain("26/10/2026");
    expect(html).toContain("26/10/2027");
    expect(html).toContain("BOXE (Anual)");
    expect(html).toMatch(/R\$\s1\.788,00/);
    expect(html).toContain("Boleto parcelado");
    // Prazo marcado no quadro do topo.
    expect(html).toMatch(/1 ano\s*\( <strong>X<\/strong> \)/);
  });

  it("menor de idade pede o responsável; dado faltando vira linha para preencher", () => {
    const html = preencherContrato(MODELO_CONTRATO, { ...base, menor: true, rg: null });
    expect(html).toContain("Responsável legal:");
    expect(html).toContain("Portador do RG: ____________________");
  });

  it("dados do aluno não viram HTML", () => {
    const html = preencherContrato(MODELO_CONTRATO, { ...base, nome: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<IMG");
    expect(html).toContain("&lt;IMG");
  });

  it("idade pela data de nascimento", () => {
    const hoje = new Date("2026-10-26T15:00:00Z");
    expect(idade("2010-10-27", hoje)).toBe(15);
    expect(idade("2010-10-26", hoje)).toBe(16);
    expect(idade(null, hoje)).toBeNull();
  });

  it("limpa script, eventos e javascript: do HTML editado", () => {
    const sujo = '<p onclick="x()">Oi<script>alert(1)</script><a href="javascript:alert(1)">l</a><style>p{}</style></p>';
    expect(limparHtmlContrato(sujo)).toBe("<p>Oi<a >l</a></p>");
  });
});
