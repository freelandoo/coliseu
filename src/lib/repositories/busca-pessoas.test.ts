import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { criarPessoaRepo, buscarPessoasRepo, pessoaComCpfRepo } from "@/lib/repositories/pessoas";

test("busca em todos os cadastros: nome sem acento, CPF e telefone; acha ex-aluno também", async () => {
  const k = String(Date.now()).slice(-6);
  // Único por execução (a busca compara só dígitos; não confere DV).
  const cpf = `${k}${k.slice(0, 5)}`;
  const p = await criarPessoaRepo({ nome: `Déborah Teste${k}`, origem: "balcao", telefone: `(11) 9${k}-1234`, cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` });
  await prisma.person.update({ where: { id: p.id }, data: { fase: "exaluno" } });
  try {
    expect((await buscarPessoasRepo(`deborah teste${k}`)).map((x) => x.id)).toContain(p.id);
    expect((await buscarPessoasRepo(cpf)).map((x) => x.id)).toContain(p.id);
    expect((await buscarPessoasRepo(`9${k}1234`)).map((x) => x.id)).toContain(p.id);
    expect((await pessoaComCpfRepo(cpf))?.id).toBe(p.id);
    expect(await pessoaComCpfRepo(cpf, p.id)).toBeNull();
  } finally {
    await prisma.person.delete({ where: { id: p.id } });
  }
});
