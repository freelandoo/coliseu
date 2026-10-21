import { expect, test } from "vitest";
import { primeiroNome, textoBoasVindas } from "@/lib/freelandoo/boas-vindas";

test("texto da boas-vindas: primeiro nome, link e validade de 7 dias", () => {
  expect(textoBoasVindas("  Maria  Souza ", "https://freelandoo.app/academia/coliseu/primeiro-acesso?token=abc")).toBe(
    "Olá, Maria! Seu acesso ao app de treinos da Academia Coliseu está pronto. " +
      "Toque para criar sua senha: https://freelandoo.app/academia/coliseu/primeiro-acesso?token=abc (vale por 7 dias).",
  );
});

test("sem nome não fica 'Olá, !'", () => {
  expect(primeiroNome("   ")).toBe("");
  expect(textoBoasVindas("", "https://l")).toMatch(/^Olá! Seu acesso/);
});
