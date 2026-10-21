import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { simularFaceCheck } from "@/lib/access/simulate";
import { avaliarContaFreelandoo } from "@/lib/freelandoo/gatilhos";

/**
 * Gatilho da catraca pelo simulador (precisa do Postgres de teste, como os
 * outros testes de integração). A passagem válida enfileira CRIAR_ACESSO e
 * NUNCA chama a rede — a catraca não espera a Freelandoo.
 */

const criados: string[] = [];
let unitId = "";
let planId = "";

async function novoAluno(dados: { cpf?: string | null; email?: string | null; dataNascimento?: string | null }) {
  const p = await prisma.person.create({
    data: {
      codigo: `TFL${Date.now()}${criados.length}`, nome: "Aluno Teste Freelandoo", origem: "balcao", fase: "aluno",
      cpf: dados.cpf === undefined ? "529.982.247-25" : dados.cpf,
      email: dados.email === undefined ? "aluno.teste@exemplo.com" : dados.email,
      dataNascimento: dados.dataNascimento === undefined ? "1990-07-30" : dados.dataNascimento,
      telefone: "11988887777", unitId,
      memberships: {
        create: { planId, status: "ACTIVE", vencimentoPlano: new Date(Date.now() + 20 * 86_400_000) },
      },
    },
  });
  criados.push(p.id);
  return p;
}

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
});

beforeEach(() => {
  vi.stubEnv("FREELANDOO_API_URL", "https://freelandoo.invalid");
  vi.stubEnv("FREELANDOO_PARTNER_KEY", "chave-de-teste");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.person.deleteMany({ where: { id: { in: criados } } });
});

test("passagem válida na catraca enfileira CRIAR_ACESSO sem tocar na rede", async () => {
  const rede = vi.spyOn(globalThis, "fetch");
  const p = await novoAluno({});
  const r = await simularFaceCheck(p.id);
  expect(r.allow).toBe(true);

  const tarefa = await prisma.tarefaFreelandoo.findUnique({ where: { dedupeKey: `criar:${p.id}` } });
  expect(tarefa).toMatchObject({ tipo: "CRIAR_ACESSO", status: "PENDENTE" });
  expect(rede).not.toHaveBeenCalled();

  // segunda passagem antes da fila rodar: continua uma tarefa só
  await simularFaceCheck(p.id);
  expect(await prisma.tarefaFreelandoo.count({ where: { personId: p.id } })).toBe(1);
});

test("faltando e-mail: não enfileira, marca falta dado com o motivo", async () => {
  const p = await novoAluno({ email: null });
  await simularFaceCheck(p.id);
  const depois = await prisma.person.findUniqueOrThrow({ where: { id: p.id } });
  expect(depois).toMatchObject({ freelandooEstado: "falta_dado", freelandooMotivo: "falta_email" });
  expect(await prisma.tarefaFreelandoo.count({ where: { personId: p.id } })).toBe(0);

  // completou o cadastro: a próxima passagem libera
  await prisma.person.update({ where: { id: p.id }, data: { email: "agora.tem@exemplo.com" } });
  await simularFaceCheck(p.id);
  expect(await prisma.tarefaFreelandoo.count({ where: { personId: p.id, tipo: "CRIAR_ACESSO" } })).toBe(1);
  expect((await prisma.person.findUniqueOrThrow({ where: { id: p.id } })).freelandooEstado).toBe("sem_conta");
});

test("menor de idade: estado menor, nada na fila", async () => {
  const p = await novoAluno({ dataNascimento: "2012-03-01" });
  expect(await avaliarContaFreelandoo(p.id)).toEqual({ tipo: "inelegivel", motivo: "menor" });
  expect((await prisma.person.findUniqueOrThrow({ where: { id: p.id } })).freelandooEstado).toBe("menor");
  // a catraca não insiste em quem é menor; o botão da ficha reavalia
  await simularFaceCheck(p.id);
  expect(await prisma.tarefaFreelandoo.count({ where: { personId: p.id } })).toBe(0);
});

test("sem a integração configurada nada acumula na fila", async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("FREELANDOO_PARTNER_KEY", "");
  const p = await novoAluno({});
  await simularFaceCheck(p.id);
  expect(await prisma.tarefaFreelandoo.count({ where: { personId: p.id } })).toBe(0);
});
