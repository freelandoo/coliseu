import { describe, expect, test } from "vitest";
import {
  FORM_VAZIO,
  alteracoesCadastro,
  formDaPessoa,
  novaPessoaDoForm,
  semAlteracoes,
  validarCadastro,
} from "@/lib/cadastro";
import type { Pessoa } from "@/lib/types";

const fichaCompleta: Pessoa = {
  id: "p1",
  codigo: "CD00042",
  nome: "Ana Souza",
  telefone: "(11) 98888-7777",
  email: "ana@exemplo.com",
  cpf: "123.456.789-09",
  rg: "12.345.678-9",
  origem: "whatsapp",
  fase: "lead",
  criadoEm: "2026-10-01T12:00:00.000Z",
  estagio: "interesse",
  dataNascimento: "1990-05-20",
  endereco: { cep: "01001-000", estado: "SP", cidade: "São Paulo", rua: "Praça da Sé", numero: "100" },
};

describe("alterações do cadastro", () => {
  test("ficha carregada e nada mexido: PATCH vazio — nada é apagado", () => {
    const base = formDaPessoa(fichaCompleta);
    expect(semAlteracoes(alteracoesCadastro(base, { ...base }))).toBe(true);
  });

  test("só o campo alterado vai; e-mail, RG, nascimento e endereço não alterados ficam de fora", () => {
    const base = formDaPessoa(fichaCompleta);
    const patch = alteracoesCadastro(base, { ...base, telefone: "(11) 97777-6666" });
    expect(patch).toEqual({ telefone: "(11) 97777-6666" });
  });

  test("endereço vai parte por parte", () => {
    const base = formDaPessoa(fichaCompleta);
    const patch = alteracoesCadastro(base, { ...base, numero: "200" });
    expect(patch).toEqual({ endereco: { numero: "200" } });
  });

  test("apagar de propósito vai como vazio", () => {
    const base = formDaPessoa(fichaCompleta);
    const patch = alteracoesCadastro(base, { ...base, email: "  " });
    expect(patch).toEqual({ email: "" });
  });

  test("espaço nas pontas não conta como mudança", () => {
    const base = formDaPessoa(fichaCompleta);
    expect(semAlteracoes(alteracoesCadastro(base, { ...base, nome: " Ana Souza " }))).toBe(true);
  });

  test("o erro antigo: partir do resumo do lead apagaria tudo — partir da ficha não", () => {
    // O resumo da Captação só tinha nome e telefone.
    const doResumo = { ...FORM_VAZIO, nome: fichaCompleta.nome, telefone: fichaCompleta.telefone! };
    const base = formDaPessoa(fichaCompleta);
    const patch = alteracoesCadastro(base, { ...doResumo, origem: base.origem });
    // Se alguém montasse o formulário pelo resumo, o diff denunciaria a perda:
    expect(patch.email).toBe("");
    expect(patch.endereco?.cep).toBe("");
    // …por isso o formulário de pessoa existente só abre depois da ficha completa.
  });
});

describe("pessoa nova", () => {
  test("endereço parcial vai só com as partes preenchidas", () => {
    const corpo = novaPessoaDoForm({ ...FORM_VAZIO, nome: "Bia", telefone: "11999998888", rua: "Rua B", numero: "5" });
    expect(corpo.endereco).toEqual({ rua: "Rua B", numero: "5" });
  });

  test("sem endereço nenhum, não manda objeto vazio", () => {
    expect(novaPessoaDoForm({ ...FORM_VAZIO, nome: "Bia", telefone: "11999998888" }).endereco).toBeUndefined();
  });
});

describe("validação", () => {
  test("lead: nome e um contato; CPF não é exigido", () => {
    expect(validarCadastro({ ...FORM_VAZIO, nome: "Bia", telefone: "11999998888" }, { exigeCpf: false })).toEqual({});
    const e = validarCadastro({ ...FORM_VAZIO }, { exigeCpf: false });
    expect(Object.keys(e).sort()).toEqual(["email", "nome", "telefone"]);
  });

  test("matrícula exige CPF com 11 dígitos", () => {
    const e = validarCadastro({ ...FORM_VAZIO, nome: "Bia", telefone: "11999998888", cpf: "123" }, { exigeCpf: true });
    expect(e.cpf).toBeTruthy();
    expect(validarCadastro({ ...FORM_VAZIO, nome: "Bia", email: "b@x.com", cpf: "12345678909" }, { exigeCpf: true })).toEqual({});
  });

  test("formato errado só conta quando preenchido", () => {
    const e = validarCadastro({ ...FORM_VAZIO, nome: "Bia", telefone: "123", email: "" }, { exigeCpf: false });
    expect(e.telefone).toMatch(/inválido/);
    expect(e.email).toBeUndefined();
  });
});
