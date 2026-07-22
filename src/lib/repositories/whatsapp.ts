import { prisma } from "@/lib/db";
import { unitIdAtual } from "@/lib/repositories/unit";
import { chaveTelefone, formatarTelefone, telefoneDoJid } from "@/lib/whatsapp/telefone";
import { proximoCodigoRepo } from "@/lib/repositories/pessoas";
import {
  INTERESSE_ESTAGIO,
  type AtendimentoItem,
  type ConversaInteresse,
  type ConversaResumo,
  type MensagemItem,
} from "@/lib/types";
import type { Prisma, WhatsappStatus } from "@prisma/client";

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
  return candidatos.find((p) => chaveTelefone(p.telefone) === chave)?.id ?? null;
}

/**
 * Garante conversa e cadastro para um número que escreveu.
 * Número já conhecido (lead ou aluno) é vinculado, nunca duplicado.
 */
export async function garantirConversaRepo(input: {
  instanceId: string;
  remoteJid: string;
  pushName: string;
}) {
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
  return {
    id: c.id,
    nome: c.person?.nome || c.pushName || formatarTelefone(c.telefone) || c.remoteJid,
    telefone: formatarTelefone(c.telefone || c.person?.telefone),
    personId: c.personId,
    atendente: c.atendente?.nome ?? null,
    interesse: c.interesse as ConversaInteresse,
    naoLidas: c.naoLidas,
    ultimaMensagemEm: c.ultimaMensagemEm.toISOString(),
    preview: c.ultimaMensagemPreview,
  };
}

export async function listarConversasRepo(): Promise<ConversaResumo[]> {
  const rows = await prisma.conversa.findMany({
    include: RESUMO_INCLUDE,
    orderBy: { ultimaMensagemEm: "desc" },
    take: 200,
  });
  return rows.map(toResumo);
}

/** Badge da aba Atendimento. */
export async function contarNaoLidasRepo(): Promise<number> {
  const r = await prisma.conversa.aggregate({ _sum: { naoLidas: true } });
  return r._sum.naoLidas ?? 0;
}

export async function obterConversaRepo(id: string): Promise<ConversaResumo | null> {
  const row = await prisma.conversa.findUnique({ where: { id }, include: RESUMO_INCLUDE });
  return row ? toResumo(row) : null;
}

/** Telefone cru para envio — o resumo só devolve o formato de exibição. */
export async function dadosEnvioConversaRepo(id: string) {
  return prisma.conversa.findUnique({
    where: { id },
    select: {
      id: true,
      telefone: true,
      atendenteId: true,
      instance: { select: { evolutionInstance: true, status: true } },
    },
  });
}

export async function marcarConversaLidaRepo(id: string) {
  return prisma.conversa.update({ where: { id }, data: { naoLidas: 0 } });
}

// ─── Mensagens ────────────────────────────────────────────────────────────────

export async function listarMensagensRepo(
  conversaId: string,
  depois?: Date,
): Promise<MensagemItem[]> {
  // `gte`, não `gt`: o WhatsApp marca o tempo em segundos, e duas mensagens no
  // mesmo segundo do cursor seriam perdidas para sempre. O cliente deduplica por id.
  const rows = await prisma.mensagem.findMany({
    where: { conversaId, ...(depois ? { enviadaEm: { gte: depois } } : {}) },
    include: { autorUser: { select: { nome: true } } },
    orderBy: { enviadaEm: "asc" },
    take: 500,
  });
  return rows.map((m) => ({
    id: m.id,
    direcao: m.direcao,
    autor: m.autor,
    autorNome: m.autorUser?.nome ?? null,
    texto: m.texto,
    tipoMidia: m.tipoMidia,
    enviadaEm: m.enviadaEm.toISOString(),
    erro: m.erro,
  }));
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
  texto: string;
  tipoMidia?: string;
  enviadaEm?: Date;
  erro?: string | null;
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
          texto: input.texto,
          tipoMidia: input.tipoMidia ?? "texto",
          enviadaEm,
          erro: input.erro ?? null,
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
    return true;
  } catch (e) {
    if (ehDuplicata(e)) return false;
    throw e;
  }
}

/**
 * Apaga só as mensagens, preservando a conversa, o vínculo com o lead e o
 * histórico de atendimento. Serve para limpar teste sem perder a classificação.
 */
export async function limparMensagensRepo(conversaId: string): Promise<number> {
  const { count } = await prisma.mensagem.deleteMany({ where: { conversaId } });
  await prisma.conversa.update({
    where: { id: conversaId },
    data: { ultimaMensagemPreview: "", naoLidas: 0 },
  });
  return count;
}

/**
 * Remove a conversa inteira (mensagens e registros de atendimento vão junto por
 * cascade). O lead **não** é apagado: ele é cadastro do CRM e continua no funil.
 * Se a pessoa escrever de novo, uma conversa nova nasce e revincula no mesmo lead.
 */
export async function removerConversaRepo(conversaId: string): Promise<boolean> {
  try {
    await prisma.conversa.delete({ where: { id: conversaId } });
    return true;
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
    ...(conversa.personId && estagio
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
