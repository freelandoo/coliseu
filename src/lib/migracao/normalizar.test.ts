import { expect, test } from "vitest";
import { dataBRparaISO, normalizarCpf, normalizarNome, regexDeCuringa, temCuringa } from "@/lib/migracao/normalizar";

test("normalizarNome: acento, caixa, espaços e pontuação", () => {
  expect(normalizarNome("  André   Luiz Cruz Gentil ")).toBe("ANDRE LUIZ CRUZ GENTIL");
  expect(normalizarNome("Maria-José d'Ávila")).toBe("MARIA JOSE D AVILA");
});

test("normalizarNome: U+FFFD (acento perdido no export do iDFace) vira curinga", () => {
  const norm = normalizarNome("Jo�o Victor");
  expect(norm).toBe("JO#O VICTOR");
  expect(temCuringa(norm)).toBe(true);
});

test("regexDeCuringa: casa exatamente uma letra por curinga", () => {
  const rx = regexDeCuringa(normalizarNome("Andr� Luiz Cruz Gentil"));
  expect(rx.test("ANDRE LUIZ CRUZ GENTIL")).toBe(true);
  expect(rx.test("ANDREA LUIZ CRUZ GENTIL")).toBe(false); // duas letras no lugar de uma: não casa
  expect(rx.test("ANDRE LUIS CRUZ GENTIL")).toBe(false); // divergência fora do curinga: não casa
});

test("normalizarCpf: só dígitos, 11 obrigatórios", () => {
  expect(normalizarCpf("216.034.558-09")).toBe("21603455809");
  expect(normalizarCpf("520320086")).toBe(""); // RG no campo de CPF: rejeita
  expect(normalizarCpf("")).toBe("");
  expect(normalizarCpf(null)).toBe("");
});

test("dataBRparaISO: datas válidas e inválidas", () => {
  expect(dataBRparaISO("24/02/2026")).toBe("2026-02-24");
  expect(dataBRparaISO("31/02/2026")).toBeNull(); // fevereiro não tem 31
  expect(dataBRparaISO("2026-02-24")).toBeNull();
  expect(dataBRparaISO("")).toBeNull();
});
