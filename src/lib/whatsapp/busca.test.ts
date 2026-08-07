import { describe, expect, test } from "vitest";
import {
  ORDEM_BANDEIRAS,
  casaConversa,
  contarBandeiras,
  filtrarPorBandeira,
  normalizar,
  trechoAoRedor,
} from "@/lib/whatsapp/busca";

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

describe("filtro por bandeira", () => {
  const lista = [
    { id: "1", interesse: "nao_classificado" as const },
    { id: "2", interesse: "com_interesse" as const },
    { id: "3", interesse: "com_interesse" as const },
    { id: "4", interesse: "perdido" as const },
  ];

  test("sem bandeira marcada, mostra tudo", () => {
    // Estado de repouso da barra: filtro que começa escondendo a inbox
    // inteira só ensina a recepção a desconfiar dele.
    expect(filtrarPorBandeira(lista, [])).toHaveLength(4);
  });

  test("uma bandeira deixa só o estágio dela", () => {
    expect(filtrarPorBandeira(lista, ["com_interesse"]).map((c) => c.id)).toEqual(["2", "3"]);
  });

  test("marcar mais de uma junta os estágios", () => {
    // "Qualificado + com interesse" é a fila de quem vale ligar hoje.
    expect(filtrarPorBandeira(lista, ["com_interesse", "perdido"]).map((c) => c.id)).toEqual([
      "2",
      "3",
      "4",
    ]);
  });

  test("bandeira sem ninguém devolve lista vazia, não a lista inteira", () => {
    expect(filtrarPorBandeira(lista, ["convertido"])).toEqual([]);
  });

  test("a contagem cobre todas as bandeiras, inclusive as zeradas", () => {
    // A bolinha zerada continua na barra: some dela seria a barra mudando de
    // tamanho a cada busca digitada.
    expect(contarBandeiras(lista)).toEqual({
      nao_classificado: 1,
      com_interesse: 2,
      sem_interesse: 0,
      perdido: 1,
      convertido: 0,
    });
  });

  test("a barra tem uma bolinha por estágio, na ordem do funil", () => {
    expect(ORDEM_BANDEIRAS).toEqual([
      "nao_classificado",
      "sem_interesse",
      "com_interesse",
      "convertido",
      "perdido",
    ]);
    expect(new Set(ORDEM_BANDEIRAS).size).toBe(Object.keys(contarBandeiras([])).length);
  });
});
