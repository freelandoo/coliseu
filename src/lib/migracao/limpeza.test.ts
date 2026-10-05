import { describe, expect, test } from "vitest";
import {
  centavos,
  chaveNome,
  chavePlano,
  chaveTelefone,
  cpfValido,
  explodirPlanos,
  finalCartao,
  formaPagamento,
  grupoDaForma,
  limparCidade,
  limparCpf,
  limparData,
  limparEmail,
  limparTelefone,
  mensalidadeDoPlano,
  nomeTitleCase,
  planoAposentado,
  tipoParcela,
} from "@/lib/migracao/limpeza";

describe("formas de pagamento", () => {
  test("conhece todos os códigos confirmados no CloudGym", () => {
    for (const c of ["CC", "ECC", "ECD", "BT", "PIXA", "OC", "BL", "DN", "CH", "DC", "LC", "GP", "TP", "OT"]) {
      expect(formaPagamento(c)).toBe(c);
    }
  });
  test("CC (recorrente) e ECC (maquininha) são formas diferentes", () => {
    expect(formaPagamento("CC")).not.toBe(formaPagamento("ECC"));
  });
  test("código desconhecido vira null; caixa e espaço são tolerados", () => {
    expect(formaPagamento("XYZ")).toBeNull();
    expect(formaPagamento("")).toBeNull();
    expect(formaPagamento(" ecd ")).toBe("ECD");
  });
  test("PIX Automático soma junto com PIX/TED/Transf, como nos relatórios do CloudGym", () => {
    expect(grupoDaForma("PIXA")).toBe("BT");
    expect(grupoDaForma("CC")).toBe("CC");
  });
});

describe("tipo da parcela e plano aposentado", () => {
  test("i = mensalidade, e = adesão, vazio = legado (estorno não é tipo)", () => {
    expect(tipoParcela("i")).toBe("mensalidade");
    expect(tipoParcela("e")).toBe("adesao");
    expect(tipoParcela("")).toBe("legado");
    expect(tipoParcela(undefined)).toBe("legado");
  });
  test("deleted ou prefixo 'W NÃO USAR' aposenta o plano", () => {
    expect(planoAposentado("W NÃO USAR Black Coliseu 3 meses", "")).toBe(true);
    expect(planoAposentado("Musculação Anual", "deleted")).toBe(true);
    expect(planoAposentado("PLANO ORFEU (ANUAL)", "")).toBe(false);
  });
});

describe("CPF", () => {
  test("valida dígitos verificadores", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
  });
  test("limpa máscara e completa zero à esquerda", () => {
    expect(limparCpf("529.982.247-25")).toBe("52998224725");
    expect(limparCpf("1234567891")).toBeNull(); // 01234567891 não fecha o DV
    expect(limparCpf("8150858008")).toBe("08150858008");
  });
  test("vazio, longo demais ou inválido vira null", () => {
    expect(limparCpf("")).toBeNull();
    expect(limparCpf("123456789012")).toBeNull();
    expect(limparCpf("000.000.000-00")).toBeNull();
  });
});

describe("telefone", () => {
  test("normaliza os formatos de origem para E.164", () => {
    expect(limparTelefone("+5511987654321")).toBe("+5511987654321");
    expect(limparTelefone("(11) 98765-4321")).toBe("+5511987654321");
    expect(limparTelefone("11987654321")).toBe("+5511987654321");
    expect(limparTelefone("(11) 4123-4567")).toBe("+551141234567");
  });
  test("vazio, sem DDD ou incompleto vira null", () => {
    expect(limparTelefone("(11) -")).toBeNull();
    expect(limparTelefone("987654321")).toBeNull();
    expect(limparTelefone("")).toBeNull();
  });
  test("chave de casamento ignora o +55", () => {
    expect(chaveTelefone("+5511987654321")).toBe(chaveTelefone("(11) 98765-4321"));
    expect(chaveTelefone("(11) -")).toBe("");
  });
});

describe("email, nome e cidade", () => {
  test("email: lowercase/trim, inválido vira null", () => {
    expect(limparEmail("  Fulano@Gmail.COM ")).toBe("fulano@gmail.com");
    expect(limparEmail("fulano@")).toBeNull();
    expect(limparEmail("")).toBeNull();
  });
  test("nome: colapsa espaços e aplica Title Case preservando partículas", () => {
    expect(nomeTitleCase("  SARA   LIMA ")).toBe("Sara Lima");
    expect(nomeTitleCase("maria DOS santos de souza")).toBe("Maria dos Santos de Souza");
    expect(nomeTitleCase("ana-clara d'avila")).toBe("Ana-Clara D'Avila");
    expect(nomeTitleCase("DA SILVA")).toBe("Da Silva"); // partícula no início continua maiúscula
  });
  test("chave de nome ignora acento, caixa e espaços duplos", () => {
    expect(chaveNome("João  Victor")).toBe(chaveNome("JOAO VICTOR"));
  });
  test("cidade: unifica grafias de São Bernardo", () => {
    for (const c of ["SAO BERNARDO DO CAMPO", "São Bernardo do Campo", "sao bernardo do campo", "SÃO BERNARDO DO CAMPO"]) {
      expect(limparCidade(c)).toBe("São Bernardo do Campo");
    }
    expect(limparCidade("Sa")).toBeNull();
    expect(limparCidade("RIBEIRAO PIRES")).toBe("Ribeirao Pires");
  });
});

describe("datas, valores e cartão", () => {
  test("data: aceita ISO com hora e rejeita absurdos do export", () => {
    expect(limparData("2026-10-03 12:20:00")).toBe("2026-10-03");
    expect(limparData("0001-01-13")).toBeNull();
    expect(limparData("8198-10-02")).toBeNull();
    expect(limparData("2026-02-30")).toBeNull();
    expect(limparData("1990-05-01", "1900-01-01", "2026-10-05")).toBe("1990-05-01");
  });
  test("valores viram centavos inteiros", () => {
    expect(centavos("109")).toBe(10900);
    expect(centavos("87.5")).toBe(8750);
    expect(centavos("0.7")).toBe(70);
    expect(centavos("")).toBeNull();
    expect(centavos("abc")).toBeNull();
  });
  test("cartão: guarda só os 4 últimos dígitos", () => {
    expect(finalCartao("5502 **** **** 1234")).toBe("1234");
    expect(finalCartao("411111******1111")).toBe("1111");
    expect(finalCartao("")).toBeNull();
  });
});

describe("planos", () => {
  test("explode o histórico separado por |", () => {
    expect(explodirPlanos("0 FIGHT+- 1 LUTA ANUAL| MUSCULAÇÃO MENSAL |")).toEqual([
      "0 FIGHT+- 1 LUTA ANUAL",
      "MUSCULAÇÃO MENSAL",
    ]);
    expect(explodirPlanos("")).toEqual([]);
  });
  test("chave de plano casa grafias com acento e espaço diferentes", () => {
    expect(chavePlano("Musculação  Mensal")).toBe(chavePlano("MUSCULACAO MENSAL"));
  });
});

describe("mensalidade do plano", () => {
  test("price × months ÷ duration (bate com os preços derivados das vendas de julho)", () => {
    expect(mensalidadeDoPlano(178800, 1, 12)).toBe(14900); // FULL ANUAL: total pago de uma vez
    expect(mensalidadeDoPlano(65400, 1, 6)).toBe(10900); // Musculação semestral
    expect(mensalidadeDoPlano(14000, 12, 12)).toBe(14000); // Anual recorrente: price já é mensal
    expect(mensalidadeDoPlano(13900, 1, 1)).toBe(13900); // Mensal
  });
  test("duração zerada não divide por zero", () => {
    expect(mensalidadeDoPlano(10000, 1, 0)).toBe(10000);
  });
});
