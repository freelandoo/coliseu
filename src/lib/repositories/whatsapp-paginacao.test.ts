import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  buscarConversasRepo,
  deltaLegadoRepo,
  listarMensagensRepo,
  paginaConversasRepo,
  paginaMensagensRepo,
} from "@/lib/repositories/whatsapp";
import { lerCursor, mesclarMensagens } from "@/lib/whatsapp/historico";
import type { MensagemItem } from "@/lib/types";

/**
 * Integração: paginação por cursor só se prova contra o banco — a ordem com
 * desempate por id e o recorte (enviadaEm, id) são do SQL.
 */

const PREFIXO = "teste-paginacao";
// Bem no futuro: as conversas de teste ficam no topo da inbox, acima do seed.
const FUTURO = Date.UTC(2099, 0, 1, 12, 0, 0);

async function limpar() {
  await prisma.conversa.deleteMany({ where: { remoteJid: { startsWith: PREFIXO } } });
  await prisma.whatsappInstance.deleteMany({ where: { evolutionInstance: { startsWith: PREFIXO } } });
}

let instanceId = "";
let conversaLonga = "";
const TOTAL_CONVERSAS = 205;
const TOTAL_MENSAGENS = 523;

beforeAll(async () => {
  await limpar();
  const u = await prisma.unit.findFirst({ orderBy: { createdAt: "asc" } });
  if (!u) throw new Error("banco sem unidade — rode o seed antes dos testes");
  const inst = await prisma.whatsappInstance.create({
    data: { unitId: u.id, evolutionInstance: `${PREFIXO}-inst`, nome: "Paginação" },
  });
  instanceId = inst.id;

  // 205 conversas; de 10 em 10 dividem o mesmo instante — o id desempata.
  await prisma.conversa.createMany({
    data: Array.from({ length: TOTAL_CONVERSAS }, (_, i) => ({
      unitId: u.id,
      instanceId,
      remoteJid: `${PREFIXO}-${String(i).padStart(3, "0")}@s.whatsapp.net`,
      telefone: `1190000${String(i).padStart(4, "0")}`,
      pushName: i === 7 ? "Valdirene Antiga Paginação" : `Contato ${i}`,
      ultimaMensagemEm: new Date(FUTURO - Math.floor(i / 10) * 60_000),
    })),
  });

  const longa = await prisma.conversa.findFirstOrThrow({
    where: { remoteJid: `${PREFIXO}-000@s.whatsapp.net` },
  });
  conversaLonga = longa.id;
  // 523 mensagens; de 7 em 7 no mesmo segundo (como o WhatsApp marca).
  await prisma.mensagem.createMany({
    data: Array.from({ length: TOTAL_MENSAGENS }, (_, i) => ({
      conversaId: conversaLonga,
      waMessageId: `${PREFIXO}-wa-${i}`,
      direcao: i % 2 ? ("IN" as const) : ("OUT" as const),
      autor: i % 2 ? ("LEAD" as const) : ("ATENDENTE" as const),
      texto: i === 3 ? "quero saber da bandagem roxa paginada" : `mensagem ${i}`,
      enviadaEm: new Date(FUTURO - 10_000_000 + Math.floor(i / 7) * 1000),
    })),
  });
});

afterAll(limpar);

async function todasAsPaginasDeConversas() {
  const vistas: string[] = [];
  let antes = null;
  for (let guarda = 0; guarda < 50; guarda++) {
    const p = await paginaConversasRepo({ antes, limite: 50 });
    vistas.push(...p.conversas.map((c) => c.id));
    if (!p.proximo) break;
    antes = lerCursor(p.proximo);
  }
  return vistas;
}

describe("inbox em páginas", () => {
  test("201+ conversas: as páginas cobrem todas, sem repetir nem pular empates", async () => {
    const vistas = await todasAsPaginasDeConversas();
    const nossas = await prisma.conversa.findMany({
      where: { remoteJid: { startsWith: PREFIXO } },
      select: { id: true },
    });
    expect(new Set(vistas).size).toBe(vistas.length); // sem repetição
    for (const c of nossas) expect(vistas).toContain(c.id); // sem buraco
  });

  test("a primeira página tem teto — não carrega o banco inteiro", async () => {
    const p = await paginaConversasRepo({ limite: 100 });
    expect(p.conversas).toHaveLength(100);
    expect(p.proximo).not.toBeNull();
  });
});

describe("busca da inbox no servidor", () => {
  test("acha conversa antiga pelo nome, fora da primeira página carregada", async () => {
    const r = await buscarConversasRepo("valdirene antiga");
    expect(r.map((c) => c.nome)).toContain("Valdirene Antiga Paginação");
  });

  test("acha pelo telefone, só com dígitos", async () => {
    const r = await buscarConversasRepo("900000150");
    expect(r.some((c) => c.telefone.replace(/\D/g, "").endsWith("900000150"))).toBe(true);
  });

  test("acha pelo histórico e devolve o trecho", async () => {
    const r = await buscarConversasRepo("bandagem roxa paginada");
    const achada = r.find((c) => c.id === conversaLonga);
    expect(achada?.trecho).toContain("bandagem roxa");
  });
});

describe("histórico em páginas", () => {
  test("abre pelo trecho mais recente, em ordem cronológica", async () => {
    const p = await paginaMensagensRepo(conversaLonga, { limite: 50 });
    expect(p.mensagens).toHaveLength(50);
    expect(p.temAnteriores).toBe(true);
    expect(p.mensagens[49].texto).toBe(`mensagem ${TOTAL_MENSAGENS - 1}`);
    const tempos = p.mensagens.map((m) => m.enviadaEm);
    expect([...tempos].sort()).toEqual(tempos);
  });

  test("501+ mensagens: 'anteriores' até o começo traz todas, uma vez cada", async () => {
    let lista: MensagemItem[] = [];
    let pagina = await paginaMensagensRepo(conversaLonga, { limite: 60 });
    lista = mesclarMensagens(lista, pagina.mensagens);
    for (let guarda = 0; pagina.temAnteriores && guarda < 50; guarda++) {
      const primeira = lista[0];
      pagina = await paginaMensagensRepo(conversaLonga, {
        antes: { em: primeira.enviadaEm, id: primeira.id },
        limite: 60,
      });
      lista = mesclarMensagens(lista, pagina.mensagens);
    }
    expect(lista).toHaveLength(TOTAL_MENSAGENS);
    expect(new Set(lista.map((m) => m.id)).size).toBe(TOTAL_MENSAGENS);
    expect(lista[0].texto).toBe("mensagem 0");
  });

  test("novidades por cursor seguem até o fim mesmo com mais que o limite de página", async () => {
    const inicio = await paginaMensagensRepo(conversaLonga, { limite: 5 });
    // Simula a tela que ficou para trás: cursor no começo da conversa.
    const primeira = await prisma.mensagem.findFirstOrThrow({
      where: { conversaId: conversaLonga },
      orderBy: [{ enviadaEm: "asc" }, { id: "asc" }],
    });
    let lista: MensagemItem[] = mesclarMensagens([], inicio.mensagens);
    // Um instante antes da primeira: `apos` é estrito, o cursor não se inclui.
    let cursor = { em: new Date(primeira.enviadaEm.getTime() - 1).toISOString(), id: "0" };
    let voltas = 0;
    for (;;) {
      const p = await paginaMensagensRepo(conversaLonga, { apos: cursor, limite: 100 });
      lista = mesclarMensagens(lista, p.mensagens);
      voltas++;
      if (!p.temMais) break;
      const u = p.mensagens[p.mensagens.length - 1];
      cursor = { em: u.enviadaEm, id: u.id };
    }
    expect(voltas).toBeGreaterThan(1);
    expect(lista).toHaveLength(TOTAL_MENSAGENS);
  });

  test("delta legado ?depois= não perde quem divide o segundo do cursor e avisa o teto", async () => {
    const meio = await prisma.mensagem.findFirstOrThrow({
      where: { conversaId: conversaLonga, waMessageId: `${PREFIXO}-wa-14` },
    });
    const d = await deltaLegadoRepo(conversaLonga, meio.enviadaEm);
    // wa-14 abre um grupo de 7 no mesmo segundo: todas voltam, inclusive ela.
    const textos = d.mensagens.map((m) => m.texto);
    for (let i = 14; i < 21; i++) expect(textos).toContain(`mensagem ${i}`);
    expect(d.mensagens).toHaveLength(500);
    expect(d.temMais).toBe(true);
  });

  test("sem cursor, o listar legado devolve o fim da conversa, não o começo", async () => {
    const r = await listarMensagensRepo(conversaLonga);
    expect(r[r.length - 1].texto).toBe(`mensagem ${TOTAL_MENSAGENS - 1}`);
  });
});
