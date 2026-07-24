import { describe, expect, test } from "vitest";
import {
  chaveTelefone,
  ehConversaAtendivel,
  ehConversaPessoal,
  ehJidGrupo,
  formatarTelefone,
  redigirTelefone,
  telefoneDoJid,
} from "@/lib/whatsapp/telefone";

describe("chaveTelefone", () => {
  test("iguala os mesmos formatos que a recepção digita e o WhatsApp entrega", () => {
    const esperado = chaveTelefone("5511987654321");
    expect(chaveTelefone("11987654321")).toBe(esperado);
    expect(chaveTelefone("(11) 98765-4321")).toBe(esperado);
    expect(chaveTelefone("+55 11 98765-4321")).toBe(esperado);
  });

  test("atravessa a ausência do 9º dígito", () => {
    expect(chaveTelefone("1187654321")).toBe(chaveTelefone("11987654321"));
  });

  test("número curto demais não vira chave (evita casar tudo com tudo)", () => {
    expect(chaveTelefone("1234")).toBe("");
    expect(chaveTelefone("")).toBe("");
    expect(chaveTelefone(null)).toBe("");
  });

  test("números diferentes não colidem", () => {
    expect(chaveTelefone("11987654321")).not.toBe(chaveTelefone("11912345678"));
  });
});

describe("ehConversaPessoal", () => {
  test("aceita conversa 1:1", () => {
    expect(ehConversaPessoal("5511987654321@s.whatsapp.net")).toBe(true);
    expect(ehConversaPessoal("199384756@lid")).toBe(true);
  });

  test("recusa grupo, transmissão e status", () => {
    expect(ehConversaPessoal("120363000000000000@g.us")).toBe(false);
    expect(ehConversaPessoal("status@broadcast")).toBe(false);
    expect(ehConversaPessoal("5511999999999@broadcast")).toBe(false);
    expect(ehConversaPessoal("")).toBe(false);
  });
});

describe("ehConversaAtendivel", () => {
  test("pessoa e grupo viram conversa", () => {
    expect(ehConversaAtendivel("5511987654321@s.whatsapp.net")).toBe(true);
    expect(ehConversaAtendivel("120363000000000000@g.us")).toBe(true);
  });

  test("transmissão e status continuam de fora", () => {
    expect(ehConversaAtendivel("status@broadcast")).toBe(false);
    expect(ehConversaAtendivel("5511999999999@broadcast")).toBe(false);
    expect(ehConversaAtendivel("")).toBe(false);
  });

  test("ehJidGrupo distingue os dois", () => {
    expect(ehJidGrupo("120363000000000000@g.us")).toBe(true);
    expect(ehJidGrupo("5511987654321@s.whatsapp.net")).toBe(false);
  });
});

describe("telefoneDoJid", () => {
  test("extrai os dígitos do JID de telefone", () => {
    expect(telefoneDoJid("5511987654321@s.whatsapp.net")).toBe("5511987654321");
  });

  test("@lid não expõe número", () => {
    expect(telefoneDoJid("199384756@lid")).toBe("");
  });

  // O id do grupo tem cara de telefone longo; tratá-lo como número criaria
  // cadastro fantasma e ainda casaria com lead de verdade pelos últimos dígitos.
  test("id de grupo não é telefone", () => {
    expect(telefoneDoJid("120363000000000000@g.us")).toBe("");
  });

  test("JID curto demais não vira telefone", () => {
    expect(telefoneDoJid("123@s.whatsapp.net")).toBe("");
  });
});

describe("formatarTelefone", () => {
  test("celular com DDI vira formato brasileiro", () => {
    expect(formatarTelefone("5511987654321")).toBe("(11) 98765-4321");
  });

  test("fixo de 10 dígitos", () => {
    expect(formatarTelefone("1132654321")).toBe("(11) 3265-4321");
  });

  test("vazio não quebra", () => {
    expect(formatarTelefone(null)).toBe("");
  });
});

test("log nunca mostra o telefone inteiro", () => {
  expect(redigirTelefone("5511987654321")).toBe("****4321");
  expect(redigirTelefone("12")).toBe("****");
});
