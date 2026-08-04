import { describe, expect, test } from "vitest";
import { casaConversa, normalizar, trechoAoRedor } from "@/lib/whatsapp/busca";

const conversa = {
  nome: "João Victor Bispo de Oliveira",
  telefone: "(11) 98017-7850",
  preview: "isso, um par de bandagem vermelha",
};

describe("normalizar", () => {
  test("iguala acento e caixa", () => {
    expect(normalizar("João")).toBe(normalizar("joao"));
    expect(normalizar("  ÉVERTON ")).toBe("everton");
  });
});

describe("casaConversa", () => {
  test("acha por pedaço do nome, com ou sem acento", () => {
    expect(casaConversa(conversa, "joao")).toBe(true);
    expect(casaConversa(conversa, "João")).toBe(true);
    expect(casaConversa(conversa, "bispo")).toBe(true);
    expect(casaConversa(conversa, "mariana")).toBe(false);
  });

  test("acha por telefone, do jeito que a recepção digita", () => {
    expect(casaConversa(conversa, "98017")).toBe(true);
    expect(casaConversa(conversa, "980177850")).toBe(true);
    expect(casaConversa(conversa, "(11) 98017-7850")).toBe(true);
    expect(casaConversa(conversa, "11")).toBe(false); // curto demais: casaria com todo mundo
    expect(casaConversa(conversa, "99999")).toBe(false);
  });

  test("acha por palavra da última mensagem", () => {
    expect(casaConversa(conversa, "bandagem")).toBe(true);
    expect(casaConversa(conversa, "luva")).toBe(false);
  });

  test("termo vazio não filtra nada", () => {
    expect(casaConversa(conversa, "")).toBe(true);
    expect(casaConversa(conversa, "   ")).toBe(true);
  });
});

describe("trechoAoRedor", () => {
  const longo =
    "Bom dia! Gostaria de saber o valor do plano anual e se vocês têm bandagem vermelha " +
    "para vender na recepção, porque a minha rasgou no treino de ontem à noite.";

  test("centra o recorte na palavra achada", () => {
    const t = trechoAoRedor(longo, "bandagem");
    expect(t).toContain("bandagem");
    expect(t.length).toBeLessThan(longo.length);
    expect(t.startsWith("…")).toBe(true);
  });

  test("texto curto sai inteiro, sem reticências", () => {
    expect(trechoAoRedor("passo para retirar", "retirar")).toBe("passo para retirar");
  });

  test("acha mesmo com acento diferente e quebra de linha", () => {
    const t = trechoAoRedor("linha um\nvocês têm bandagem?", "voces");
    expect(t).toContain("vocês têm bandagem?");
    expect(t).not.toContain("\n");
  });
});
