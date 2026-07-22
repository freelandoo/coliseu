import { describe, expect, test } from "vitest";
import { conexaoAberta, lerMensagem, mensagensDoEvento } from "@/lib/whatsapp/payload";

const BASE = {
  key: { id: "3EB0ABC", remoteJid: "5511987654321@s.whatsapp.net", fromMe: false },
  pushName: "Maria",
  messageTimestamp: 1_752_000_000,
};

describe("lerMensagem", () => {
  test("texto simples", () => {
    const m = lerMensagem({ ...BASE, message: { conversation: "Oi, quero saber o valor" } });
    expect(m).toMatchObject({
      waMessageId: "3EB0ABC",
      remoteJid: "5511987654321@s.whatsapp.net",
      fromMe: false,
      pushName: "Maria",
      texto: "Oi, quero saber o valor",
      tipoMidia: "texto",
    });
    expect(m?.enviadaEm.getTime()).toBe(1_752_000_000 * 1000);
  });

  test("texto estendido (resposta a mensagem citada)", () => {
    const m = lerMensagem({ ...BASE, message: { extendedTextMessage: { text: "Pode ser amanhã" } } });
    expect(m?.texto).toBe("Pode ser amanhã");
  });

  test("imagem com legenda guarda a legenda", () => {
    const m = lerMensagem({ ...BASE, message: { imageMessage: { caption: "Minha carteirinha" } } });
    expect(m).toMatchObject({ texto: "Minha carteirinha", tipoMidia: "imagem" });
  });

  test("imagem sem legenda vira marcador legível", () => {
    const m = lerMensagem({ ...BASE, message: { imageMessage: {} } });
    expect(m).toMatchObject({ texto: "📷 Imagem", tipoMidia: "imagem" });
  });

  test("áudio vira marcador — v1 não baixa mídia", () => {
    const m = lerMensagem({ ...BASE, message: { audioMessage: { seconds: 8 } } });
    expect(m).toMatchObject({ texto: "🎤 Áudio", tipoMidia: "audio" });
  });

  test("resposta de botão entra como texto", () => {
    const m = lerMensagem({
      ...BASE,
      message: { buttonsResponseMessage: { selectedDisplayText: "Quero matricular" } },
    });
    expect(m?.texto).toBe("Quero matricular");
  });

  test("mensagem enviada pelo aparelho é marcada fromMe", () => {
    const m = lerMensagem({
      ...BASE,
      key: { ...BASE.key, fromMe: true },
      message: { conversation: "Bom dia!" },
    });
    expect(m?.fromMe).toBe(true);
  });

  test("remoteJidAlt prevalece sobre @lid, que não expõe telefone", () => {
    const m = lerMensagem({
      ...BASE,
      key: { id: "X1", remoteJid: "199384756@lid", remoteJidAlt: "5511987654321@s.whatsapp.net" },
      message: { conversation: "oi" },
    });
    expect(m?.remoteJid).toBe("5511987654321@s.whatsapp.net");
  });

  test("sem conteúdo aproveitável devolve null", () => {
    expect(lerMensagem({ ...BASE, message: { conversation: "   " } })).toBeNull();
    expect(lerMensagem({ ...BASE, message: null })).toBeNull();
    expect(lerMensagem({ key: { remoteJid: "x@s.whatsapp.net" }, message: {} })).toBeNull();
    expect(lerMensagem(null)).toBeNull();
  });

  test("timestamp ausente cai para agora em vez de 1970", () => {
    const antes = Date.now() - 1000;
    const m = lerMensagem({ ...BASE, messageTimestamp: undefined, message: { conversation: "oi" } });
    expect(m!.enviadaEm.getTime()).toBeGreaterThan(antes);
  });
});

describe("mensagensDoEvento", () => {
  test("aceita os dois formatos que a Evolution manda", () => {
    expect(mensagensDoEvento({ messages: [{ a: 1 }, { a: 2 }] })).toHaveLength(2);
    expect(mensagensDoEvento({ key: { id: "1" } })).toHaveLength(1);
    expect(mensagensDoEvento([{ a: 1 }])).toHaveLength(1);
    expect(mensagensDoEvento(null)).toHaveLength(0);
  });
});

test("conexaoAberta reconhece os apelidos de 'conectado'", () => {
  expect(conexaoAberta("open")).toBe(true);
  expect(conexaoAberta("CONNECTED")).toBe(true);
  expect(conexaoAberta("close")).toBe(false);
  expect(conexaoAberta(undefined)).toBe(false);
});
