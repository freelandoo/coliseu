import { describe, expect, test } from "vitest";
import { deveEnviarNoEnter, dicaComposer, type TeclaComposer } from "@/lib/whatsapp/atalho-envio";

function tecla(over: Partial<TeclaComposer> = {}): TeclaComposer {
  return { key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, ...over };
}

describe("deveEnviarNoEnter", () => {
  test("com a preferência ligada, Enter sozinho envia", () => {
    expect(deveEnviarNoEnter(tecla(), true)).toBe(true);
  });

  test("com a preferência desligada, Enter sozinho só quebra linha", () => {
    expect(deveEnviarNoEnter(tecla(), false)).toBe(false);
  });

  test("Shift+Enter nunca envia — é a quebra de linha de quem escolheu enviar no Enter", () => {
    expect(deveEnviarNoEnter(tecla({ shiftKey: true }), true)).toBe(false);
    expect(deveEnviarNoEnter(tecla({ shiftKey: true }), false)).toBe(false);
  });

  test("Ctrl/⌘+Enter envia nos dois perfis — ninguém fica sem atalho de envio", () => {
    expect(deveEnviarNoEnter(tecla({ ctrlKey: true }), false)).toBe(true);
    expect(deveEnviarNoEnter(tecla({ metaKey: true }), false)).toBe(true);
    expect(deveEnviarNoEnter(tecla({ ctrlKey: true }), true)).toBe(true);
  });

  test("Enter de composição (acento, sugestão do teclado) não envia", () => {
    expect(deveEnviarNoEnter(tecla({ isComposing: true }), true)).toBe(false);
    expect(deveEnviarNoEnter(tecla({ isComposing: true, ctrlKey: true }), true)).toBe(false);
  });

  test("outras teclas passam direto", () => {
    expect(deveEnviarNoEnter(tecla({ key: "a" }), true)).toBe(false);
    expect(deveEnviarNoEnter(tecla({ key: "Tab" }), true)).toBe(false);
  });
});

describe("dicaComposer", () => {
  test("conta o atalho que sobrou para o outro uso", () => {
    expect(dicaComposer(true)).toContain("Shift+Enter");
    expect(dicaComposer(false)).toContain("Ctrl+Enter");
  });
});
