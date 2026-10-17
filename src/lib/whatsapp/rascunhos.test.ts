import { beforeEach, describe, expect, test } from "vitest";
import {
  apagarRascunho,
  conviteTratado,
  guardarRascunho,
  lerRascunho,
  limparTudo,
  marcarConviteTratado,
  temRascunho,
  usarConta,
} from "@/lib/whatsapp/rascunhos";
import type { MensagemItem } from "@/lib/types";

const citada: MensagemItem = {
  id: "m1",
  direcao: "IN",
  autor: "LEAD",
  autorNome: null,
  remetente: null,
  texto: "qual o horário do muay thai?",
  tipoMidia: "texto",
  enviadaEm: "2026-10-17T12:00:00.000Z",
  erro: null,
  citavel: true,
  citada: null,
};

beforeEach(() => {
  limparTudo();
  usarConta("conta-a");
});

describe("rascunhos por conversa", () => {
  test("cada conversa guarda o seu texto — nada migra para outra pessoa", () => {
    guardarRascunho("c1", { texto: "oi, Ana", citando: null });
    guardarRascunho("c2", { texto: "oi, Bruno", citando: citada });
    expect(lerRascunho("c1")).toEqual({ texto: "oi, Ana", citando: null });
    expect(lerRascunho("c2")?.citando?.id).toBe("m1");
    expect(lerRascunho("c3")).toBeNull();
  });

  test("texto em branco sem citação não é rascunho", () => {
    guardarRascunho("c1", { texto: "algo", citando: null });
    guardarRascunho("c1", { texto: "   ", citando: null });
    expect(temRascunho("c1")).toBe(false);
    expect(lerRascunho("c1")).toBeNull();
  });

  test("apagar (depois do envio) tira só daquela conversa", () => {
    guardarRascunho("c1", { texto: "a", citando: null });
    guardarRascunho("c2", { texto: "b", citando: null });
    apagarRascunho("c1");
    expect(lerRascunho("c1")).toBeNull();
    expect(lerRascunho("c2")?.texto).toBe("b");
  });

  test("outra conta na mesma aba não herda texto nem convite tratado", () => {
    guardarRascunho("c1", { texto: "dado sensível", citando: null });
    marcarConviteTratado("c1", "2026-10-10");
    usarConta("conta-b");
    expect(lerRascunho("c1")).toBeNull();
    expect(conviteTratado("c1", "2026-10-10")).toBe(false);
  });

  test("a mesma conta reentrando não perde nada", () => {
    guardarRascunho("c1", { texto: "continua", citando: null });
    usarConta("conta-a");
    expect(lerRascunho("c1")?.texto).toBe("continua");
  });

  test("citação de bolha ainda não confirmada não é guardada", () => {
    guardarRascunho("c1", { texto: "x", citando: { ...citada, id: "tmp:1" } });
    expect(lerRascunho("c1")?.citando).toBeNull();
  });
});

describe("convite de remarcação", () => {
  test("tratado vale por conversa e data", () => {
    expect(conviteTratado("c1", "2026-10-10")).toBe(false);
    marcarConviteTratado("c1", "2026-10-10");
    expect(conviteTratado("c1", "2026-10-10")).toBe(true);
    expect(conviteTratado("c1", "2026-10-11")).toBe(false);
    expect(conviteTratado("c2", "2026-10-10")).toBe(false);
  });
});
