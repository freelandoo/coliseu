import { prisma } from "@/lib/db";
import { unitIdAtual } from "@/lib/repositories/unit";
import { chaveTelefone, formatarTelefone, telefoneDoJid } from "@/lib/whatsapp/telefone";
import { publicarMensagem } from "@/lib/whatsapp/eventos";
import { notificarMensagemRecebida } from "@/lib/push/notificar";
import { proximoCodigoRepo } from "@/lib/repositories/pessoas";
import { arquivarConversaRepo } from "@/lib/repositories/whatsapp-backup";
import {
  INTERESSE_ESTAGIO,
  type AtendimentoItem,
  type ConversaBuscaItem,
  type ConversaInteresse,
  type ConversaResumo,
  type MensagemItem,
} from "@/lib/types";
import type { Prisma, WhatsappStatus } from "@prisma/client";
import {
  codificarCursor,
  PAGINA_CONVERSAS,
  PAGINA_MENSAGENS,
  type Cursor,
} from "@/lib/whatsapp/historico";

/** Quem apagou — vai congelado na lixeira, para a trilha sobreviver à conta. */
type Ator = { id: string; nome: string } | null;

/** Violação de unique — usada para tratar reentrega do webhook como no-op. */
function ehDuplicata(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// ─── Instância ────────────────────────────────────────────────────────────────

export async function instanciaAtualRepo() {
  return prisma.whatsappInstance.findFirst({ orderBy: { criadoEm: "asc" } });
}

export async function registrarInstanciaRepo(evolutionInstance: string, nome: string) {
  const unitId = await unitIdAtual();
  return prisma.whatsappInstance.upsert({
    where: { evolutionInstance },
    update: { nome, status: "CONNECTING", ultimoEstadoEm: new Date() },
    create: { unitId, evolutionInstance, nome, status: "CONNECTING", ultimoEstadoEm: new Date() },
  });
}

export async function atualizarStatusInstanciaRepo(
  evolutionInstance: string,
  status: WhatsappStatus,
  numeroConectado?: string | null,
) {
  return prisma.whatsappInstance
    .update({
      where: { evolutionInstance },
      data: {
        status,
        ultimoEstadoEm: new Date(),
        ...(numeroConectado === undefined ? {} : { numeroConectado }),
      },
    })
    .catch(() => null); // instância removida no meio do polling não é erro
}

// ─── Conversa ─────────────────────────────────────────────────────────────────

/**
 * Acha o cadastro dono do número. Compara pelos últimos 8 dígitos para
 * atravessar DDI e 9º dígito — ver `chaveTelefone`.
 */
async function acharPessoaPorTelefone(telefone: string): Promise<string | null> {
  const chave = chaveTelefone(telefone);
  if (!chave) return null;
  // `endsWith` cobre o cadastro guardado com DDI; o filtro em memória cobre o
  // cadastro formatado ("(11) 90000-0000"), que o SQL não casaria.
  const candidatos = await prisma.person.findMany({
    where: { telefone: { not: null } },
    select: { id: true, telefone: true, fase: true },
    orderBy: { criadoEm: "asc" },
  });
  const donos = candidatos.filter((p) => chaveTelefone(p.telefone) === chave);
  // Cadastro vivo (lead/aluno) ganha do ex-aluno do histórico com o mesmo número.
  const dono = donos.find((p) => p.fase !== "exaluno") ?? donos[0];
  if (!dono) return null;
  if (dono.fase === "exaluno") {
    // Ex-aluno que voltou a escrever é oportunidade de reativação: volta ao funil.
    await prisma.person.update({ where: { id: dono.id }, data: { fase: "lead", estagio: "novo" } });
  }
  return dono.id;
}

/**
 * Garante conversa e cadastro para um número que escreveu.
 * Número já conhecido (lead ou aluno) é vinculado, nunca duplicado.
 *
 * Grupo é a exceção: conversa coletiva não é pessoa, então não gera cadastro
 * nem entra no funil de leads. Fica só como conversa a ser atendida.
 */
export async function garantirConversaRepo(input: {
  instanceId: string;
  remoteJid: string;
  pushName: string;
  ehGrupo?: boolean;
}) {
  const ehGrupo = input.ehGrupo ?? false;
  const existente = await prisma.conversa.findUnique({
    where: { instanceId_remoteJid: { instanceId: input.instanceId, remoteJid: input.remoteJid } },
  });
  if (existente) {
    // pushName muda quando a pessoa troca o nome do perfil; mantém o mais recente.
    if (input.pushName && input.pushName !== existente.pushName) {
      return prisma.conversa.update({
        where: { id: existente.id },
        data: { pushName: input.pushName },
      });
    }
    return existente;
  }

  const unitId = await unitIdAtual();
  const telefone = telefoneDoJid(input.remoteJid);

  if (ehGrupo) {
    return prisma.conversa.create({
      data: {
        unitId,
        instanceId: input.instanceId,
        remoteJid: input.remoteJid,
        telefone: "",
        pushName: input.pushName || null,
        ehGrupo: true,
      },
    });
  }

  let personId = telefone ? await acharPessoaPorTelefone(telefone) : null;

  if (!personId) {
    const pessoa = await prisma.person.create({
      data: {
        codigo: await proximoCodigoRepo(),
        nome: input.pushName || formatarTelefone(telefone) || "Contato do WhatsApp",
        telefone: telefone || null,
        origem: "whatsapp",
        fase: "lead",
        estagio: "novo",
        unitId,
      },
      select: { id: true },
    });
    personId = pessoa.id;
  }

  return prisma.conversa.create({
    data: {
      unitId,
      instanceId: input.instanceId,
      remoteJid: input.remoteJid,
      telefone,
      pushName: input.pushName || null,
      personId,
    },
  });
}

const RESUMO_INCLUDE = {
  person: { select: { id: true, nome: true, telefone: true } },
  atendente: { select: { nome: true } },
} satisfies Prisma.ConversaInclude;

type ConversaComResumo = Prisma.ConversaGetPayload<{ include: typeof RESUMO_INCLUDE }>;

function toResumo(c: ConversaComResumo): ConversaResumo {
  // Grupo ainda não sincronizado não tem assunto: mostrar o JID cru ("120363…")
  // não diz nada a quem atende, então o rótulo genérico serve até o nome chegar.
  if (c.ehGrupo) {
    return {
      id: c.id,
      nome: c.pushName || "Grupo do WhatsApp",
      telefone: "",
      ehGrupo: true,
      personId: null,
      atendente: c.atendente?.nome ?? null,
      interesse: c.interesse as ConversaInteresse,
      naoLidas: c.naoLidas,
      ultimaMensagemEm: c.ultimaMensagemEm.toISOString(),
      preview: c.ultimaMensagemPreview,
    };
  }
  return {
    id: c.id,
    nome: c.person?.nome || c.pushName || formatarTelefone(c.telefone) || c.remoteJid,
    telefone: formatarTelefone(c.telefone || c.person?.telefone),
    ehGrupo: false,
    personId: c.personId,
    atendente: c.atendente?.nome ?? null,
    interesse: c.interesse as ConversaInteresse,
    naoLidas: c.naoLidas,
    ultimaMensagemEm: c.ultimaMensagemEm.toISOString(),
    preview: c.ultimaMensagemPreview,
  };
}

/**
 * Uma página da inbox, da conversa mais recente para a mais antiga. `antes` é
 * o cursor da última linha da página anterior: (ultimaMensagemEm, id), com o id
 * desempatando conversas que receberam mensagem no mesmo instante.
 */
export async function paginaConversasRepo(
  opcoes: { antes?: Cursor | null; limite?: number } = {},
): Promise<{ conversas: ConversaResumo[]; proximo: string | null }> {
  const limite = opcoes.limite ?? PAGINA_CONVERSAS;
  const antes = opcoes.antes;
  const rows = await prisma.conversa.findMany({
    where: antes
      ? {
          OR: [
            { ultimaMensagemEm: { lt: new Date(antes.em) } },
            { ultimaMensagemEm: new Date(antes.em), id: { lt: antes.id } },
          ],
        }
      : undefined,
    include: RESUMO_INCLUDE,
    orderBy: [{ ultimaMensagemEm: "desc" }, { id: "desc" }],
    take: limite + 1,
  });
  const pagina = rows.slice(0, limite);
  const ultima = pagina[pagina.length - 1];
  return {
    conversas: pagina.map(toResumo),
    proximo:
      rows.length > limite && ultima
        ? codificarCursor({ em: ultima.ultimaMensagemEm.toISOString(), id: ultima.id })
        : null,
  };
}

/** A primeira página da inbox — o que a tela abre. */
export async function listarConversasRepo(): Promise<ConversaResumo[]> {
  return (await paginaConversasRepo()).conversas;
}

/**
 * Conversas em que alguém escreveu o termo — a parte da busca que só o banco
 * enxerga: o histórico.
 *
 * `contains` insensitive vira ILIKE: sem índice de texto, mas a academia tem
 * ordem de dezenas de milhares de mensagens — e o teto de linhas segura o custo
 * do pior caso (termo curtíssimo que casa com quase tudo).
 */
export async function buscarConversasPorMensagemRepo(
  termo: string,
  limite = 30,
): Promise<ConversaBuscaItem[]> {
  const alvo = termo.trim();
  if (alvo.length < 2) return [];

  const mensagens = await prisma.mensagem.findMany({
    where: { texto: { contains: alvo, mode: "insensitive" } },
    orderBy: { enviadaEm: "desc" },
    take: 400,
    select: { conversaId: true, texto: true },
  });

  // A mais recente de cada conversa é a que vira trecho na lista.
  const trechos = new Map<string, string>();
  for (const m of mensagens) {
    if (trechos.size >= limite && !trechos.has(m.conversaId)) continue;
    if (!trechos.has(m.conversaId)) trechos.set(m.conversaId, m.texto);
  }
  if (trechos.size === 0) return [];

  const rows = await prisma.conversa.findMany({
    where: { id: { in: [...trechos.keys()] } },
    include: RESUMO_INCLUDE,
    orderBy: { ultimaMensagemEm: "desc" },
  });
  return rows.map((r) => ({ ...toResumo(r), trecho: trechos.get(r.id) ?? "" }));
}

/**
 * A busca inteira da inbox, no servidor: nome (do cadastro ou do perfil),
 * telefone e histórico. A lista carregada na tela é só a primeira página — a
 * conversa antiga que a recepção procura pode não estar nela.
 *
 * Achado por nome/telefone vem sem trecho (a linha mostra a última mensagem);
 * achado no histórico traz o pedaço que casou.
 */
export async function buscarConversasRepo(termo: string, limite = 30): Promise<ConversaBuscaItem[]> {
  const alvo = termo.trim();
  if (alvo.length < 2) return [];
  const numeros = alvo.replace(/\D/g, "");

  const porNome = await prisma.conversa.findMany({
    where: {
      OR: [
        { pushName: { contains: alvo, mode: "insensitive" } },
        { person: { nome: { contains: alvo, mode: "insensitive" } } },
        // O telefone da conversa é guardado só com dígitos; três já separam.
        ...(numeros.length >= 3 ? [{ telefone: { contains: numeros } }] : []),
      ],
    },
    include: RESUMO_INCLUDE,
    orderBy: [{ ultimaMensagemEm: "desc" }, { id: "desc" }],
    take: limite,
  });
  const porMensagem = await buscarConversasPorMensagemRepo(alvo, limite);

  const porId = new Map<string, ConversaBuscaItem>();
  for (const r of porNome) porId.set(r.id, { ...toResumo(r), trecho: "" });
  for (const m of porMensagem) porId.set(m.id, m); // trecho do histórico vale mais
  return [...porId.values()]
    .sort((a, b) =>
      a.ultimaMensagemEm !== b.ultimaMensagemEm
        ? b.ultimaMensagemEm.localeCompare(a.ultimaMensagemEm)
        : b.id.localeCompare(a.id),
    )
    .slice(0, limite);
}

/**
 * personId → conversaId, para a tabela de leads oferecer "Responder" em vez de
 * mandar a recepção para o WhatsApp Web. Uma pessoa pode ter mais de uma
 * conversa (números diferentes); vale a mais recente.
 */
export async function mapaConversaPorPessoaRepo(): Promise<Map<string, string>> {
  const rows = await prisma.conversa.findMany({
    where: { personId: { not: null } },
    select: { id: true, personId: true },
    orderBy: { ultimaMensagemEm: "asc" },
  });
  // asc + set: a última gravada vence, que é a conversa mais recente.
  return new Map(rows.map((r) => [r.personId!, r.id]));
}

/** Badge da aba Atendimento. */
export async function contarNaoLidasRepo(): Promise<number> {
  const r = await prisma.conversa.aggregate({ _sum: { naoLidas: true } });
  return r._sum.naoLidas ?? 0;
}

/**
 * Totais da central do admin, numa consulta só: MENSAGENS não lidas (a mesma
 * soma do badge) e quantas CONVERSAS as têm. São números diferentes — três
 * mensagens da mesma pessoa são uma conversa — e a tela rotula cada um.
 */
export async function totaisNaoLidasRepo(): Promise<{ mensagens: number; conversas: number }> {
  const r = await prisma.conversa.aggregate({
    where: { naoLidas: { gt: 0 } },
    _sum: { naoLidas: true },
    _count: { _all: true },
  });
  return { mensagens: r._sum.naoLidas ?? 0, conversas: r._count._all };
}

/**
 * As conversas mais recentes que têm mensagem não lida, filtradas no banco —
 * não é um recorte da primeira página da inbox (conversa antiga com não lida
 * ficaria de fora). Só lê o resumo: nada aqui marca como lida.
 */
export async function conversasComNaoLidasRepo(limite = 6): Promise<ConversaResumo[]> {
  const rows = await prisma.conversa.findMany({
    where: { naoLidas: { gt: 0 } },
    include: RESUMO_INCLUDE,
    orderBy: [{ ultimaMensagemEm: "desc" }, { id: "desc" }],
    take: limite,
  });
  return rows.map(toResumo);
}

export async function obterConversaRepo(id: string): Promise<ConversaResumo | null> {
  const row = await prisma.conversa.findUnique({ where: { id }, include: RESUMO_INCLUDE });
  return row ? toResumo(row) : null;
}

/**
 * Endereço cru para envio — o resumo só devolve o formato de exibição.
 * Grupo se endereça pelo JID (`120363…@g.us`); pessoa, pelo telefone.
 */
export async function dadosEnvioConversaRepo(id: string) {
  return prisma.conversa.findUnique({
    where: { id },
    select: {
      id: true,
      telefone: true,
      remoteJid: true,
      ehGrupo: true,
      atendenteId: true,
      instance: { select: { evolutionInstance: true, status: true } },
    },
  });
}

/**
 * Grava o assunto dos grupos vindo da Evolution. A mensagem do webhook não traz
 * o nome do grupo — só o de quem escreveu —, então o título chega por aqui.
 * Devolve quantas conversas foram renomeadas.
 */
export async function renomearGruposRepo(assuntos: Map<string, string>): Promise<number> {
  if (assuntos.size === 0) return 0;
  const grupos = await prisma.conversa.findMany({
    where: { ehGrupo: true, remoteJid: { in: [...assuntos.keys()] } },
    select: { id: true, remoteJid: true, pushName: true },
  });

  let renomeados = 0;
  for (const g of grupos) {
    const assunto = assuntos.get(g.remoteJid)?.trim();
    if (!assunto || assunto === g.pushName) continue;
    await prisma.conversa.update({ where: { id: g.id }, data: { pushName: assunto } });
    renomeados++;
  }
  return renomeados;
}

/**
 * O que é preciso para buscar a mídia de uma mensagem na Evolution: o id que o
 * WhatsApp deu e a instância que recebeu. Mensagem nossa enviada sem eco do
 * WhatsApp tem id `local:` e não tem mídia para buscar.
 */
export async function dadosMidiaMensagemRepo(id: string) {
  const m = await prisma.mensagem.findUnique({
    where: { id },
    select: {
      waMessageId: true,
      tipoMidia: true,
      conversa: { select: { instance: { select: { evolutionInstance: true } } } },
    },
  });
  if (!m || m.tipoMidia === "texto" || m.waMessageId.startsWith("local:")) return null;
  return { waMessageId: m.waMessageId, instancia: m.conversa.instance.evolutionInstance };
}

export async function marcarConversaLidaRepo(id: string) {
  return prisma.conversa.update({ where: { id }, data: { naoLidas: 0 } });
}

// ─── Mensagens ────────────────────────────────────────────────────────────────

/**
 * Quanto do trecho citado é guardado. Cabe a citação inteira que o WhatsApp
 * mostra em cima da resposta, sem inchar a linha para quem escreveu um texto
 * longo.
 */
const LIMITE_CITACAO = 300;

/** Envio local (sem eco do WhatsApp) ou que falhou não pode ser citado. */
function podeSerCitada(m: { waMessageId: string; erro: string | null }): boolean {
  return !m.waMessageId.startsWith("local:") && !m.erro;
}

const INCLUDE_MENSAGEM = { autorUser: { select: { nome: true } } } satisfies Prisma.MensagemInclude;

type LinhaMensagem = Prisma.MensagemGetPayload<{ include: typeof INCLUDE_MENSAGEM }>;

/** Teto do delta legado (`?depois=`) — o mesmo de antes. */
const TETO_DELTA_LEGADO = 500;

/**
 * Delta legado (`?depois=<ISO>`) e, sem cursor, as mensagens mais recentes.
 *
 * `gte`, não `gt`: o WhatsApp marca o tempo em segundos, e duas mensagens no
 * mesmo segundo do cursor seriam perdidas para sempre. O cliente deduplica por id.
 * O delta sai em ordem crescente e para no teto — `temMais` (em
 * `deltaLegadoRepo`) avisa quando ficou coisa para trás.
 *
 * Sem `depois`, devolve o **fim** da conversa (as mais recentes), em ordem
 * cronológica. Antes devolvia o começo, e uma conversa longa abria no passado.
 */
export async function listarMensagensRepo(
  conversaId: string,
  depois?: Date,
): Promise<MensagemItem[]> {
  if (!depois) {
    return (await paginaMensagensRepo(conversaId, { limite: TETO_DELTA_LEGADO })).mensagens;
  }
  return (await deltaLegadoRepo(conversaId, depois)).mensagens;
}

export async function deltaLegadoRepo(
  conversaId: string,
  depois: Date,
): Promise<{ mensagens: MensagemItem[]; temMais: boolean }> {
  const rows = await prisma.mensagem.findMany({
    where: { conversaId, enviadaEm: { gte: depois } },
    include: INCLUDE_MENSAGEM,
    orderBy: [{ enviadaEm: "asc" }, { id: "asc" }],
    take: TETO_DELTA_LEGADO + 1,
  });
  const temMais = rows.length > TETO_DELTA_LEGADO;
  return { mensagens: await paraItens(conversaId, rows.slice(0, TETO_DELTA_LEGADO)), temMais };
}

/**
 * Uma página do histórico, sempre em ordem cronológica:
 *
 * - sem cursor: as `limite` mais recentes (`temAnteriores` diz se há mais atrás);
 * - `antes`: as `limite` imediatamente anteriores ao cursor;
 * - `apos`: as `limite` imediatamente posteriores (`temMais` diz se o delta
 *   continua — a tela pede a próxima com o cursor da última recebida).
 *
 * O cursor é (enviadaEm, id): mensagens no mesmo segundo não se perdem nem se
 * repetem entre páginas.
 */
export async function paginaMensagensRepo(
  conversaId: string,
  opcoes: { antes?: Cursor | null; apos?: Cursor | null; limite?: number } = {},
): Promise<{ mensagens: MensagemItem[]; temAnteriores: boolean; temMais: boolean }> {
  const limite = opcoes.limite ?? PAGINA_MENSAGENS;

  if (opcoes.apos) {
    const c = opcoes.apos;
    const rows = await prisma.mensagem.findMany({
      where: {
        conversaId,
        OR: [
          { enviadaEm: { gt: new Date(c.em) } },
          { enviadaEm: new Date(c.em), id: { gt: c.id } },
        ],
      },
      include: INCLUDE_MENSAGEM,
      orderBy: [{ enviadaEm: "asc" }, { id: "asc" }],
      take: limite + 1,
    });
    return {
      mensagens: await paraItens(conversaId, rows.slice(0, limite)),
      temAnteriores: true,
      temMais: rows.length > limite,
    };
  }

  const c = opcoes.antes;
  const rows = await prisma.mensagem.findMany({
    where: c
      ? {
          conversaId,
          OR: [
            { enviadaEm: { lt: new Date(c.em) } },
            { enviadaEm: new Date(c.em), id: { lt: c.id } },
          ],
        }
      : { conversaId },
    include: INCLUDE_MENSAGEM,
    orderBy: [{ enviadaEm: "desc" }, { id: "desc" }],
    take: limite + 1,
  });
  const pagina = rows.slice(0, limite).reverse();
  return {
    mensagens: await paraItens(conversaId, pagina),
    temAnteriores: rows.length > limite,
    temMais: false,
  };
}

/** A mensagem gravada por um envio, pelo id que o WhatsApp (ou o fallback local) deu. */
export async function mensagemPorWaIdRepo(
  conversaId: string,
  waMessageId: string,
): Promise<MensagemItem | null> {
  const row = await prisma.mensagem.findFirst({
    where: { conversaId, waMessageId },
    include: INCLUDE_MENSAGEM,
  });
  return row ? ((await paraItens(conversaId, [row]))[0] ?? null) : null;
}

async function paraItens(conversaId: string, rows: LinhaMensagem[]): Promise<MensagemItem[]> {
  // Onde está a original de cada citação. A busca é no histórico inteiro, não
  // no lote: num delta, a mensagem citada quase sempre é mais antiga que o
  // cursor — e o painel já a tem na tela para pular até ela.
  const citados = [...new Set(rows.map((m) => m.citadaWaId).filter((id): id is string => !!id))];
  const originais = citados.length
    ? await prisma.mensagem.findMany({
        where: { conversaId, waMessageId: { in: citados } },
        select: { id: true, waMessageId: true },
      })
    : [];
  const idPorWaId = new Map(originais.map((o) => [o.waMessageId, o.id]));

  return rows.map((m) => ({
    id: m.id,
    direcao: m.direcao,
    autor: m.autor,
    autorNome: m.autorUser?.nome ?? null,
    remetente: m.remetente,
    texto: m.texto,
    tipoMidia: m.tipoMidia,
    enviadaEm: m.enviadaEm.toISOString(),
    erro: m.erro,
    citavel: podeSerCitada(m),
    citada: m.citadaWaId
      ? {
          // Original apagada da conversa: sobra o trecho copiado, sem o pulo.
          id: idPorWaId.get(m.citadaWaId) ?? null,
          texto: m.citadaTexto ?? "",
          autor: m.citadaAutor,
        }
      : null,
  }));
}

/** O que fica guardado da mensagem citada — cópia, não referência. */
export interface CitacaoGravada {
  waId: string;
  texto: string;
  autor: string | null;
}

type MensagemParaCitar = {
  waMessageId: string;
  texto: string;
  erro: string | null;
  direcao: "IN" | "OUT";
  remetente: string | null;
  autorUser: { nome: string } | null;
  conversa: { pushName: string | null; telefone: string; person: { nome: string } | null };
};

/**
 * Quem escreveu a mensagem citada, do jeito que a citação vai mostrar. Saída é
 * "Você" quando não dá para saber qual atendente respondeu (mensagem mandada
 * pelo celular do dono); entrada é o nome de quem falou no grupo, ou o da
 * pessoa da conversa.
 */
function autorDaCitacao(m: MensagemParaCitar): string | null {
  if (m.direcao === "OUT") return m.autorUser?.nome ?? "Você";
  return (
    m.remetente ||
    m.conversa.person?.nome ||
    m.conversa.pushName ||
    formatarTelefone(m.conversa.telefone) ||
    null
  );
}

const SELECT_CITACAO = {
  waMessageId: true,
  texto: true,
  erro: true,
  direcao: true,
  remetente: true,
  autorUser: { select: { nome: true } },
  conversa: { select: { pushName: true, telefone: true, person: { select: { nome: true } } } },
} as const;

function paraCitacao(m: MensagemParaCitar | null): CitacaoGravada | null {
  if (!m || !podeSerCitada(m)) return null;
  return {
    waId: m.waMessageId,
    texto: m.texto.slice(0, LIMITE_CITACAO),
    autor: autorDaCitacao(m),
  };
}

/**
 * A mensagem que a recepção escolheu citar. Amarrada à conversa de propósito:
 * um id de outra conversa não vira citação, mesmo vindo de sessão válida.
 * Devolve null quando a mensagem não existe ou não pode ser citada.
 */
export async function citacaoPorIdRepo(
  conversaId: string,
  mensagemId: string,
): Promise<CitacaoGravada | null> {
  const m = await prisma.mensagem.findFirst({
    where: { id: mensagemId, conversaId },
    select: SELECT_CITACAO,
  });
  return paraCitacao(m);
}

/**
 * A citação de uma mensagem que chegou pelo webhook: o WhatsApp manda o `key.id`
 * da original, e o resto (quem escreveu) sai do nosso próprio histórico.
 * Original que o Coliseu nunca viu devolve null — o texto da prévia do WhatsApp
 * ainda é guardado pela ingestão.
 */
export async function citacaoPorWaIdRepo(
  conversaId: string,
  waId: string,
): Promise<CitacaoGravada | null> {
  const m = await prisma.mensagem.findFirst({
    where: { conversaId, waMessageId: waId },
    select: SELECT_CITACAO,
  });
  return paraCitacao(m);
}

/**
 * Grava a mensagem e atualiza o resumo da conversa na mesma transação.
 * `waMessageId` é unique: reentrega da Evolution vira no-op silencioso.
 * Devolve `false` quando era duplicata.
 */
export async function registrarMensagemRepo(input: {
  conversaId: string;
  waMessageId: string;
  direcao: "IN" | "OUT";
  autor: "LEAD" | "ATENDENTE";
  autorUserId?: string | null;
  remetente?: string | null;
  texto: string;
  tipoMidia?: string;
  enviadaEm?: Date;
  erro?: string | null;
  /** Mensagem citada, quando esta é uma resposta a outra. */
  citada?: CitacaoGravada | null;
}): Promise<boolean> {
  const enviadaEm = input.enviadaEm ?? new Date();
  try {
    await prisma.$transaction([
      prisma.mensagem.create({
        data: {
          conversaId: input.conversaId,
          waMessageId: input.waMessageId,
          direcao: input.direcao,
          autor: input.autor,
          autorUserId: input.autorUserId ?? null,
          remetente: input.remetente ?? null,
          texto: input.texto,
          tipoMidia: input.tipoMidia ?? "texto",
          enviadaEm,
          erro: input.erro ?? null,
          citadaWaId: input.citada?.waId ?? null,
          citadaTexto: input.citada?.texto.slice(0, LIMITE_CITACAO) ?? null,
          citadaAutor: input.citada?.autor ?? null,
        },
      }),
      prisma.conversa.update({
        where: { id: input.conversaId },
        data: {
          ultimaMensagemEm: enviadaEm,
          ultimaMensagemPreview: input.texto.slice(0, 140),
          ...(input.direcao === "IN" ? { naoLidas: { increment: 1 } } : { naoLidas: 0 }),
        },
      }),
    ]);
    // Avisa as conexões SSE abertas — só quando é mensagem nova (não duplicata).
    publicarMensagem({ conversaId: input.conversaId, direcao: input.direcao });
    // Push no celular só para mensagem recebida; fire-and-forget — o aviso
    // nunca pode atrasar nem derrubar a gravação.
    if (input.direcao === "IN") {
      void notificarMensagemRecebida(input.conversaId).catch(() => {});
    }
    return true;
  } catch (e) {
    if (ehDuplicata(e)) return false;
    throw e;
  }
}

/**
 * Apaga só as mensagens, preservando a conversa, o vínculo com o lead e o
 * histórico de atendimento. Serve para limpar teste sem perder a classificação.
 *
 * Antes de apagar, o histórico vai inteiro para a lixeira (/backup) — cópia e
 * exclusão na mesma transação, para nunca sobrar uma sem a outra.
 */
export async function limparMensagensRepo(conversaId: string, ator: Ator = null): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await arquivarConversaRepo(tx, { conversaId, motivo: "limpar", ator });
    const { count } = await tx.mensagem.deleteMany({ where: { conversaId } });
    await tx.conversa.update({
      where: { id: conversaId },
      data: { ultimaMensagemPreview: "", naoLidas: 0 },
    });
    return count;
  });
}

/**
 * Remove a conversa inteira (mensagens e registros de atendimento vão junto por
 * cascade). O lead **não** é apagado: ele é cadastro do CRM e continua no funil.
 * Se a pessoa escrever de novo, uma conversa nova nasce e revincula no mesmo lead.
 *
 * A conversa e o histórico ficam guardados na lixeira (/backup) — o registro de
 * atendimento, não: ele é trilha de auditoria e some junto com a conversa.
 */
export async function removerConversaRepo(conversaId: string, ator: Ator = null): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const backupId = await arquivarConversaRepo(tx, { conversaId, motivo: "remover", ator });
      if (!backupId) return false; // conversa já removida
      await tx.conversa.delete({ where: { id: conversaId } });
      return true;
    });
  } catch {
    return false; // já removida
  }
}

export async function assumirConversaRepo(conversaId: string, userId: string) {
  return prisma.conversa.update({ where: { id: conversaId }, data: { atendenteId: userId } });
}

// ─── Classificação (cadastro de atendimento) ──────────────────────────────────

/**
 * Registra o atendimento e propaga a classificação para o funil do lead.
 * O registro é append-only: fica o histórico de quem classificou o quê.
 */
export async function classificarConversaRepo(input: {
  conversaId: string;
  userId: string;
  interesse: ConversaInteresse;
  observacao?: string;
  motivoPerdido?: string;
}) {
  const conversa = await prisma.conversa.findUnique({
    where: { id: input.conversaId },
    select: { id: true, personId: true },
  });
  if (!conversa) return null;

  const estagio = INTERESSE_ESTAGIO[input.interesse];

  await prisma.$transaction([
    prisma.conversa.update({
      where: { id: conversa.id },
      data: { interesse: input.interesse, atendenteId: input.userId },
    }),
    prisma.atendimentoRegistro.create({
      data: {
        conversaId: conversa.id,
        userId: input.userId,
        interesse: input.interesse,
        observacao: input.observacao?.trim() || null,
      },
    }),
    // Sempre reflete no funil: o estágio do lead acompanha a conversa, inclusive
    // quando a recepção volta atrás na classificação.
    ...(conversa.personId
      ? [
          prisma.person.update({
            where: { id: conversa.personId },
            data: {
              estagio,
              motivoPerdido:
                input.interesse === "perdido" ? input.motivoPerdido?.trim() || "Sem interesse" : null,
            },
          }),
        ]
      : []),
  ]);

  return obterConversaRepo(conversa.id);
}

export async function listarAtendimentosRepo(conversaId: string): Promise<AtendimentoItem[]> {
  const rows = await prisma.atendimentoRegistro.findMany({
    where: { conversaId },
    include: { user: { select: { nome: true } } },
    orderBy: { criadoEm: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    usuario: r.user.nome,
    interesse: r.interesse as ConversaInteresse,
    observacao: r.observacao,
    criadoEm: r.criadoEm.toISOString(),
  }));
}
