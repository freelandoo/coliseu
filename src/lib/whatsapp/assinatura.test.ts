import { describe, expect, test } from "vitest";
import { assinar, nomeAssinatura, prefixoAssinatura } from "@/lib/whatsapp/assinatura";

describe("nomeAssinatura", () => {
  test("login com ponto vira só o primeiro nome, como nome de gente", () => {
    expect(nomeAssinatura("alex.rodriguus")).toBe("Alex");
  });

  test("login sem ponto vale inteiro", () => {
    expect(nomeAssinatura("recepcao")).toBe("Recepcao");
  });

  test("caixa alta do login não vaza para o cliente", () => {
    expect(nomeAssinatura("MARIA.SOUZA")).toBe("Maria");
  });

  test("login vazio não inventa nome", () => {
    expect(nomeAssinatura("  ")).toBe("");
  });
});

describe("assinar", () => {
  test("cola o nome em negrito na frente da mensagem", () => {
    expect(assinar("Bom dia!", "alex.rodriguus")).toBe("*Alex:* Bom dia!");
  });

  test("não assina duas vezes o que já vinha assinado", () => {
    const uma = assinar("Bom dia!", "alex.rodriguus");
    expect(assinar(uma, "alex.rodriguus")).toBe(uma);
  });

  test("texto em branco continua em branco — assinatura sozinha não é mensagem", () => {
    expect(assinar("   ", "alex.rodriguus")).toBe("");
  });

  test("sem login, a mensagem sai como foi escrita", () => {
    expect(assinar("Bom dia!", "")).toBe("Bom dia!");
  });

  test("prefixo é o que o painel usa na bolha otimista", () => {
    expect(prefixoAssinatura("alex.rodriguus")).toBe("*Alex:* ");
  });
});
