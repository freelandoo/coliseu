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

  test("resposta citando traz a original: id e trecho", () => {
    const m = lerMensagem({
      ...BASE,
      message: {
        extendedTextMessage: {
          text: "Pode ser às 18h",
          contextInfo: {
            stanzaId: "3EB0ORIGINAL",
            participant: "5511999999999@s.whatsapp.net",
            quotedMessage: { conversation: "Que horas você pode?" },
          },
        },
      },
    });
    expect(m?.texto).toBe("Pode ser às 18h");
    expect(m?.citacao).toEqual({ waId: "3EB0ORIGINAL", texto: "Que horas você pode?" });
  });

  test("citação de mídia usa o mesmo rótulo do histórico", () => {
    const m = lerMensagem({
      ...BASE,
      message: {
        extendedTextMessage: {
          text: "É essa mesmo",
          contextInfo: { stanzaId: "3EB0FOTO", quotedMessage: { imageMessage: {} } },
        },
      },
    });
    expect(m?.citacao).toEqual({ waId: "3EB0FOTO", texto: "📷 Imagem" });
  });

  test("legenda de imagem também pode citar", () => {
    const m = lerMensagem({
      ...BASE,
      message: {
        imageMessage: {
          caption: "Segue o comprovante",
          contextInfo: { stanzaId: "3EB0COBR", quotedMessage: { conversation: "Faltou o pagamento" } },
        },
      },
    });
    expect(m).toMatchObject({ texto: "Segue o comprovante", tipoMidia: "imagem" });
    expect(m?.citacao?.waId).toBe("3EB0COBR");
  });

  test("mensagem comum não cita ninguém", () => {
    const m = lerMensagem({ ...BASE, message: { conversation: "oi" } });
    expect(m?.citacao).toBeNull();
  });

  test("contexto sem stanzaId (encaminhada, por exemplo) não vira citação", () => {
    const m = lerMensagem({
      ...BASE,
      message: { extendedTextMessage: { text: "oi", contextInfo: { isForwarded: true } } },
    });
    expect(m?.citacao).toBeNull();
  });

  test("timestamp ausente cai para agora em vez de 1970", () => {
    const antes = Date.now() - 1000;
    const m = lerMensagem({ ...BASE, messageTimestamp: undefined, message: { conversation: "oi" } });
    expect(m!.enviadaEm.getTime()).toBeGreaterThan(antes);
  });
});

describe("formatos que antes sumiam", () => {
  const ler = (message: Record<string, unknown>) => lerMensagem({ ...BASE, message });

  test("mensagem temporária e visualização única abrem o envelope", () => {
    expect(ler({ ephemeralMessage: { message: { conversation: "oi temporário" } } })?.texto).toBe("oi temporário");
    const foto = ler({ viewOnceMessageV2: { message: { imageMessage: { caption: "só uma vez" } } } });
    expect(foto).toMatchObject({ texto: "só uma vez", tipoMidia: "imagem" });
    const dupla = ler({ ephemeralMessage: { message: { extendedTextMessage: { text: "dentro de dois" } } } });
    expect(dupla?.texto).toBe("dentro de dois");
  });

  test("foto de álbum e documento com legenda", () => {
    expect(ler({ associatedChildMessage: { message: { imageMessage: {} } } })?.tipoMidia).toBe("imagem");
    expect(
      ler({ documentWithCaptionMessage: { message: { documentMessage: { caption: "contrato" } } } }),
    ).toMatchObject({ texto: "contrato", tipoMidia: "documento" });
  });

  test("contato, localização, enquete e evento viram texto legível", () => {
    expect(ler({ contactMessage: { displayName: "Tawane", vcard: "BEGIN:VCARD" } })?.texto).toBe("👤 Contato: Tawane");
    expect(
      ler({ contactsArrayMessage: { contacts: [{ displayName: "Ana" }, { displayName: "Bia" }] } })?.texto,
    ).toBe("👤 Contatos: Ana, Bia");
    expect(ler({ locationMessage: { name: "Academia Coliseu", address: "R. Gen. Osório, 272" } })?.texto).toBe(
      "📍 Localização: Academia Coliseu — R. Gen. Osório, 272",
    );
    expect(ler({ pollCreationMessageV3: { name: "Melhor horário?" } })?.texto).toBe("📊 Enquete: Melhor horário?");
    expect(ler({ eventMessage: { name: "Aulão" } })?.texto).toBe("📅 Evento: Aulão");
  });

  test("mensagens de empresa (botões, template, interativa) mostram o corpo", () => {
    expect(ler({ buttonsMessage: { contentText: "Quer ver os planos?" } })?.texto).toBe("Quer ver os planos?");
    expect(ler({ templateMessage: { hydratedTemplate: { hydratedContentText: "Seu boleto" } } })?.texto).toBe(
      "Seu boleto",
    );
    expect(ler({ interactiveMessage: { body: { text: "Comece agora" } } })?.texto).toBe("Comece agora");
    expect(ler({ templateButtonReplyMessage: { selectedDisplayText: "Quero" } })?.texto).toBe("Quero");
  });

  test("tipo desconhecido é registrado como não suportada, não descartado", () => {
    expect(ler({ algumTipoNovoMessage: { x: 1 } })).toMatchObject({
      texto: "Mensagem não suportada — veja no celular",
      tipoMidia: "outro",
    });
  });

  test("reação, edição, voto e aviso de álbum continuam fora", () => {
    for (const m of [
      { reactionMessage: { text: "❤️" } },
      { protocolMessage: { type: 0 } },
      { messageContextInfo: {}, secretEncryptedMessage: { encIv: "x" } },
      { albumMessage: { expectedImageCount: 2 }, messageContextInfo: {} },
      { pinInChatMessage: {} },
    ]) {
      expect(ler(m)).toBeNull();
    }
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
