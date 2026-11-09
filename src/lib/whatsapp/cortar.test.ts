import { expect, test } from "vitest";
import { cortarTexto } from "@/lib/whatsapp/cortar";

test("texto curto fica igual", () => {
  expect(cortarTexto("oi 😊", 140)).toBe("oi 😊");
});

test("corte no meio de um emoji não deixa meio caractere", () => {
  const texto = "a".repeat(139) + "😊 resto";
  const r = cortarTexto(texto, 140);
  expect(r).toBe("a".repeat(139));
  expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
  expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(r)).toBe(false);
});

test("emoji inteiro antes do limite é mantido", () => {
  expect(cortarTexto("a".repeat(138) + "😊xyz", 140)).toBe("a".repeat(138) + "😊");
});
