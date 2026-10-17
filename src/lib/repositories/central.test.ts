import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { conversasComNaoLidasRepo, paginaConversasRepo, totaisNaoLidasRepo } from "@/lib/repositories/whatsapp";
import { listarAulasExperimentaisEntreRepo } from "@/lib/repositories/aulas-experimentais";
import { cobrancasEmAbertoRepo } from "@/lib/repositories/cobrancas";
import { contarAlunosAtivosRepo } from "@/lib/repositories/pessoas";

/**
 * Integração: os agregados da central (/painel) são consultas no banco — o
 * filtro de não lidas, a soma por status e "a última matrícula" só se provam
 * contra o SQL. As contagens comparam antes/depois: o seed continua lá.
 */

const PREFIXO = "teste-central";
// Bem no futuro: as conversas lidas ficam no topo da inbox, acima do seed.
const FUTURO = Date.UTC(2099, 0, 1, 12, 0, 0);

let unitId = "";
let planId = "";
let instanceId = "";
const pessoas: string[] = [];

async function limpar() {
  await prisma.conversa.deleteMany({ where: { remoteJid: { startsWith: PREFIXO } } });
  await prisma.whatsappInstance.deleteMany({ where: { evolutionInstance: { startsWith: PREFIXO } } });
  await prisma.aulaExperimental.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  await prisma.person.deleteMany({ where: { codigo: { startsWith: "TC-" } } });
}

beforeAll(async () => {
  await limpar();
  const u = await prisma.unit.findFirst({ orderBy: { createdAt: "asc" } });
  const plano = await prisma.plan.findFirst();
  if (!u || !plano) throw new Error("banco sem unidade/plano — rode o seed antes dos testes");
  unitId = u.id;
  planId = plano.id;
  const inst = await prisma.whatsappInstance.create({
    data: { unitId, evolutionInstance: `${PREFIXO}-inst`, nome: "Central" },
  });
  instanceId = inst.id;
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("não lidas", () => {
  test("filtra no banco: a conversa antiga com não lida aparece, mesmo fora da 1ª página", async () => {
    const antes = await totaisNaoLidasRepo();
    // 120 conversas lidas e recentes empurram a antiga para fora da 1ª página.
    await prisma.conversa.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        unitId,
        instanceId,
        remoteJid: `${PREFIXO}-lida-${i}@s.whatsapp.net`,
        telefone: "",
        ultimaMensagemEm: new Date(FUTURO - i * 60_000),
      })),
    });
    const antiga = await prisma.conversa.create({
      data: {
        unitId,
        instanceId,
        remoteJid: `${PREFIXO}-antiga@s.whatsapp.net`,
        telefone: "",
        naoLidas: 3,
        ultimaMensagemEm: new Date(Date.UTC(2001, 0, 1)),
      },
    });
    await prisma.conversa.create({
      data: { unitId, instanceId, remoteJid: `${PREFIXO}-nova@s.whatsapp.net`, telefone: "", naoLidas: 2, ultimaMensagemEm: new Date(FUTURO) },
    });

    const primeiraPagina = (await paginaConversasRepo()).conversas.map((c) => c.id);
    expect(primeiraPagina).not.toContain(antiga.id);

    const comNaoLidas = await conversasComNaoLidasRepo(500);
    expect(comNaoLidas.map((c) => c.id)).toContain(antiga.id);
    expect(comNaoLidas.every((c) => c.naoLidas > 0)).toBe(true);
    // mais recente primeiro
    const ordem = comNaoLidas.map((c) => c.ultimaMensagemEm);
    expect([...ordem].sort().reverse()).toEqual(ordem);

    // mensagens e conversas são números diferentes
    const depois = await totaisNaoLidasRepo();
    expect(depois.mensagens - antes.mensagens).toBe(5);
    expect(depois.conversas - antes.conversas).toBe(2);

    // ler o resumo não marca nada como lido
    const ainda = await prisma.conversa.findUniqueOrThrow({ where: { id: antiga.id } });
    expect(ainda.naoLidas).toBe(3);
  });
});

describe("agenda", () => {
  test("só os dias do intervalo (inclusive), por data e hora", async () => {
    const aulas: [string, number][] = [
      ["2099-01-01", 9], ["2099-01-02", 18], ["2099-01-02", 7], ["2099-01-04", 10], ["2099-01-05", 8],
    ];
    for (const [data, hora] of aulas) {
      await prisma.aulaExperimental.create({
        data: { unitId, nome: `${PREFIXO} ${data} ${hora}`, telefone: "", modalidade: "Boxe", data, hora },
      });
    }
    const r = (await listarAulasExperimentaisEntreRepo("2099-01-02", "2099-01-04")).filter((a) =>
      a.nome.startsWith(PREFIXO),
    );
    expect(r.map((a) => `${a.data} ${a.hora}`)).toEqual(["2099-01-02 7", "2099-01-02 18", "2099-01-04 10"]);
  });
});

describe("alunos e cobranças", () => {
  async function pessoa(codigo: string, fase: "aluno" | "lead", status: ("ACTIVE" | "CANCELED")[]) {
    const p = await prisma.person.create({
      data: { unitId, codigo, nome: `${PREFIXO} ${codigo}`, origem: "balcao", fase },
    });
    pessoas.push(p.id);
    // a ordem do array é a cronológica: o último é a matrícula mais recente
    for (const [i, s] of status.entries()) {
      await prisma.membership.create({
        data: {
          personId: p.id,
          planId,
          status: s,
          matriculadoEm: new Date(Date.UTC(2090, 0, 1 + i)),
          vencimentoPlano: new Date(Date.UTC(2091, 0, 1)),
        },
      });
    }
    return p.id;
  }

  test("ativo = fase aluno e ÚLTIMA matrícula ativa", async () => {
    const antes = await contarAlunosAtivosRepo();
    await pessoa("TC-1", "aluno", ["ACTIVE"]); // conta
    await pessoa("TC-2", "aluno", ["ACTIVE", "CANCELED"]); // cancelou depois: não conta
    await pessoa("TC-3", "aluno", ["CANCELED", "ACTIVE"]); // voltou: conta
    await pessoa("TC-4", "lead", ["ACTIVE"]); // não é aluno
    await pessoa("TC-5", "aluno", []); // sem matrícula
    expect((await contarAlunosAtivosRepo()) - antes).toBe(2);
  });

  test("em aberto = pendente + atrasado; pago fica de fora", async () => {
    const antes = await cobrancasEmAbertoRepo();
    const personId = pessoas[0];
    const venc = new Date(Date.UTC(2099, 0, 1));
    await prisma.cobranca.createMany({
      data: [
        { personId, tipo: "mensalidade", valor: 10, vencimento: venc, status: "pendente" },
        { personId, tipo: "mensalidade", valor: 20.5, vencimento: venc, status: "atrasado" },
        { personId, tipo: "mensalidade", valor: 99, vencimento: venc, status: "pago" },
      ],
    });
    const depois = await cobrancasEmAbertoRepo();
    expect(depois.quantidade - antes.quantidade).toBe(2);
    expect(depois.valor - antes.valor).toBeCloseTo(30.5);
    expect(depois.atrasadas.quantidade - antes.atrasadas.quantidade).toBe(1);
    expect(depois.atrasadas.valor - antes.atrasadas.valor).toBeCloseTo(20.5);
  });
});
