import { describe, expect, test } from "vitest";
import { duracao, escolherFormato, extensaoDoFormato } from "@/lib/whatsapp/gravacao";

/** Simula o `MediaRecorder.isTypeSupported` de cada navegador. */
const suporta = (aceitos: string[]) => (mime: string) => aceitos.includes(mime);

describe("escolherFormato", () => {
  test("Firefox grava ogg/opus — o formato que o WhatsApp já usa", () => {
    expect(escolherFormato(suporta(["audio/ogg;codecs=opus", "audio/webm"]))).toBe(
      "audio/ogg;codecs=opus",
    );
  });

  test("Chrome/Android caem em webm/opus", () => {
    expect(escolherFormato(suporta(["audio/webm;codecs=opus", "audio/webm"]))).toBe(
      "audio/webm;codecs=opus",
    );
  });

  test("Safari só tem mp4 — e é por ele que o iPhone grava", () => {
    expect(escolherFormato(suporta(["audio/mp4"]))).toBe("audio/mp4");
  });

  test("navegador que não anuncia nada grava no padrão dele", () => {
    expect(escolherFormato(suporta([]))).toBe("");
  });
});

test("extensão acompanha o formato", () => {
  expect(extensaoDoFormato("audio/ogg;codecs=opus")).toBe("ogg");
  expect(extensaoDoFormato("audio/mp4")).toBe("m4a");
  expect(extensaoDoFormato("audio/webm;codecs=opus")).toBe("webm");
  expect(extensaoDoFormato("")).toBe("webm");
});

test("contador em mm:ss", () => {
  expect(duracao(0)).toBe("0:00");
  expect(duracao(9)).toBe("0:09");
  expect(duracao(75)).toBe("1:15");
  expect(duracao(600)).toBe("10:00");
  expect(duracao(-3)).toBe("0:00");
});
