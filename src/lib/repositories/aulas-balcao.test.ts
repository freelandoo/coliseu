import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { criarPessoaRepo } from "@/lib/repositories/pessoas";
import { acharPorTelefoneRepo, criarAulaExperimentalRepo } from "@/lib/repositories/aulas-experimentais";

// Números únicos por execução: o banco de teste não é limpo entre rodadas.
const fim = String(Date.now()).slice(-8);

test("acha o cadastro pelo telefone em qualquer formato (8 últimos dígitos) e prefere quem não é ex-aluno", async () => {
  const ex = await criarPessoaRepo({ nome: "Ex Aluno", origem: "balcao", telefone: `(11) 9${fim.slice(0, 4)}-${fim.slice(4)}` });
  await prisma.person.update({ where: { id: ex.id }, data: { fase: "exaluno" } });
  const lead = await criarPessoaRepo({ nome: "Lead Atual", origem: "balcao", telefone: `119${fim}` });

  const r = await acharPorTelefoneRepo(`55 11 9${fim}`);
  expect(r.personId).toBe(lead.id);
  expect(r.nome).toBe("Lead Atual");
  expect(r.fase).toBe("lead");
});

test("número desconhecido não acha ninguém; aula do balcão grava sem conversa e com observação", async () => {
  const r = await acharPorTelefoneRepo("11900000000".slice(0, 3) + "7" + fim.split("").reverse().join(""));
  expect(r.personId).toBeNull();
  const user = await prisma.user.findFirstOrThrow();
  const aula = await criarAulaExperimentalRepo({
    conversaId: null, personId: null, nome: "Visitante", telefone: `119${fim}`,
    modalidade: "Boxe", data: "2099-01-02", hora: 18, agendadoPorId: user.id, observacao: "vem com a mãe",
  });
  expect(aula.conversaId).toBeNull();
  expect(aula.observacao).toBe("vem com a mãe");
  await prisma.aulaExperimental.delete({ where: { id: aula.id } });
});
