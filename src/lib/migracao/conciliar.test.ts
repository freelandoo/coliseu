import { expect, test } from "vitest";
import type { AlunoCloudGym } from "@/lib/migracao/cloudgym";
import { conciliar, type UsuarioDevice } from "@/lib/migracao/conciliar";
import { normalizarNome } from "@/lib/migracao/normalizar";

const DESDE_2026 = Date.UTC(2026, 0, 1) / 1000;

function dev(id: number, name: string, lastAccess = DESDE_2026 + 1000): UsuarioDevice {
  return { id, registration: "", name, nomeNorm: normalizarNome(name), imageTimestamp: 1_700_000_000, lastAccess };
}

function aluno(nome: string, extra: Partial<AlunoCloudGym> = {}): AlunoCloudGym {
  return {
    nome, nomeNorm: normalizarNome(nome), status: "ATIVO", cpf: "", email: "", celular: "",
    plano: "MUSCULAÇÃO ANUAL", inicioISO: "2026-01-01", fimISO: "2027-01-01",
    nascimentoISO: null, estado: "SP", cidade: "SBC", cep: "", ...extra,
  };
}

test("nome exato e único: ADOTAR com confiança ALTA", () => {
  const r = conciliar([dev(100, "Maria Silva")], [aluno("MARIA SILVA")], [], DESDE_2026);
  expect(r.itens[0]).toMatchObject({ situacao: "ADOTAR", confianca: "ALTA", via: "NOME_EXATO" });
  expect(r.resumo.adotar).toBe(1);
});

test("dois alunos com o mesmo nome NUNCA casam: AMBIGUO", () => {
  const r = conciliar(
    [dev(100, "João Souza")],
    [aluno("João Souza", { cpf: "11111111111" }), aluno("João Souza", { cpf: "22222222222" })],
    [], DESDE_2026,
  );
  expect(r.itens[0].situacao).toBe("AMBIGUO");
  expect(r.itens[0].aluno).toBeNull();
});

test("nome duplicado no aparelho também é AMBIGUO", () => {
  const r = conciliar([dev(1, "Rafael Giusti"), dev(2, "Rafael Giusti")], [aluno("Rafael Giusti")], [], DESDE_2026);
  expect(r.itens.every((i) => i.situacao === "AMBIGUO")).toBe(true);
});

test("curinga de acento perdido casa único: REVISAR com confiança MEDIA", () => {
  const r = conciliar([dev(7, "Andr� Luiz Cruz Gentil")], [aluno("André Luiz Cruz Gentil")], [], DESDE_2026);
  expect(r.itens[0]).toMatchObject({ situacao: "REVISAR", confianca: "MEDIA", via: "NOME_CURINGA" });
  // casou → não deve aparecer como "sem face"
  expect(r.semFace).toHaveLength(0);
});

test("curinga que casa mais de um nome: AMBIGUO", () => {
  const r = conciliar([dev(7, "Jul�a Costa")], [aluno("Julia Costa"), aluno("Julya Costa")], [], DESDE_2026);
  expect(r.itens[0].situacao).toBe("AMBIGUO");
});

test("mesmo nome ativo E inativo no CloudGym: o ativo engole (pessoa renovou)", () => {
  const r = conciliar(
    [dev(9, "Adriana Nunes")],
    [aluno("Adriana Nunes", { status: "ATIVO" }), aluno("Adriana Nunes", { status: "INATIVO" })],
    [], DESDE_2026,
  );
  expect(r.itens[0].situacao).toBe("ADOTAR");
  expect(r.itens[0].aluno?.status).toBe("ATIVO");
});

test("casou só com INATIVO: REVISAR, nunca adoção automática", () => {
  const r = conciliar([dev(9, "Aaine Poiani")], [aluno("Aaine Poiani", { status: "INATIVO" })], [], DESDE_2026);
  expect(r.itens[0]).toMatchObject({ situacao: "REVISAR", confianca: "MEDIA" });
});

test("órfão: sem par no CloudGym; acesso recente é destacado no resumo", () => {
  const r = conciliar(
    [dev(1, "Fantasma Antigo", DESDE_2026 - 10), dev(2, "Frequentador Misterioso", DESDE_2026 + 10)],
    [], [], DESDE_2026,
  );
  expect(r.resumo.orfaos).toBe(2);
  expect(r.resumo.orfaosComAcessoRecente).toBe(1);
});

test("ativo do CloudGym sem face no aparelho entra em semFace", () => {
  const r = conciliar([dev(1, "Maria Silva")], [aluno("Maria Silva"), aluno("Sem Face Silva")], [], DESDE_2026);
  expect(r.semFace.map((a) => a.nome)).toEqual(["Sem Face Silva"]);
});

test("CPF do aluno casado encontra Person já existente no Coliseu", () => {
  const r = conciliar(
    [dev(1, "Maria Silva")],
    [aluno("Maria Silva", { cpf: "21603455809" })],
    [{ id: "person-1", cpf: "21603455809" }],
    DESDE_2026,
  );
  expect(r.itens[0].personIdExistente).toBe("person-1");
});
