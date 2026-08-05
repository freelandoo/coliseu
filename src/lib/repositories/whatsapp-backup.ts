import { prisma } from "@/lib/db";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import type { BackupMotivo, ConversaBackupItem, ConversaInteresse } from "@/lib/types";
import type { Prisma } from "@prisma/client";

/**
 * Lixeira do atendimento. "Limpar" e "remover" não apagam mais em definitivo:
 * copiam a conversa e o histórico para ConversaBackup/MensagemBackup antes.
 *
 * A cópia é solta de propósito — sem chave estrangeira para Conversa, User ou
 * Person — porque ela precisa continuar de pé justamente quando o original
 * deixou de existir. Restaurar recria a conversa e as mensagens que faltam.
 */

type Ator = { id: string; nome: string } | null;

/**
 * Copia a conversa e as mensagens para a lixeira. Devolve o id do backup, ou
 * null quando não havia nada a guardar (conversa sumida, ou "limpar" numa
 * conversa que já estava sem mensagem — backup vazio só polui a lista).
 */
export async function arquivarConversaRepo(
  tx: Prisma.TransactionClient,
  input: { conversaId: string; motivo: BackupMotivo; ator: Ator },
): Promise<string | null> {
  const conversa = await tx.conversa.findUnique({ where: { id: input.conversaId } });
  if (!conversa) return null;

  const mensagens = await tx.mensagem.findMany({
    where: { conversaId: conversa.id },
    orderBy: { enviadaEm: "asc" },
  });
  if (input.motivo === "limpar" && mensagens.length === 0) return null;

  const backup = await tx.conversaBackup.create({
    data: {
      conversaId: conversa.id,
      unitId: conversa.unitId,
      instanceId: conversa.instanceId,
      remoteJid: conversa.remoteJid,
      telefone: conversa.telefone,
      pushName: conversa.pushName,
      ehGrupo: conversa.ehGrupo,
      personId: conversa.personId,
      atendenteId: conversa.atendenteId,
      interesse: conversa.interesse,
      ultimaMensagemEm: conversa.ultimaMensagemEm,
      ultimaMensagemPreview: conversa.ultimaMensagemPreview,
      conversaCriadaEm: conversa.criadoEm,
      motivo: input.motivo,
      excluidoPorId: input.ator?.id ?? null,
      // Nome copiado no ato: o backup tem de dizer quem apagou mesmo depois de
      // a conta do colaborador sumir.
      excluidoPorNome: input.ator?.nome ?? "sistema",
      mensagens: {
        create: mensagens.map((m) => ({
          mensagemId: m.id,
          waMessageId: m.waMessageId,
          direcao: m.direcao,
          autor: m.autor,
          autorUserId: m.autorUserId,
          remetente: m.remetente,
          texto: m.texto,
          tipoMidia: m.tipoMidia,
          enviadaEm: m.enviadaEm,
          erro: m.erro,
          citadaWaId: m.citadaWaId,
          citadaTexto: m.citadaTexto,
          citadaAutor: m.citadaAutor,
        })),
      },
    },
    select: { id: true },
  });

  return backup.id;
}

// ─── Listagem ─────────────────────────────────────────────────────────────────

type BackupComContagem = Prisma.ConversaBackupGetPayload<{
  include: { _count: { select: { mensagens: true } } };
}>;

function rotulo(b: BackupComContagem, nomePessoa: string | undefined): string {
  if (b.ehGrupo) return b.pushName || "Grupo do WhatsApp";
  return nomePessoa || b.pushName || formatarTelefone(b.telefone) || b.remoteJid;
}

/**
 * Lista a lixeira, da exclusão mais recente para a mais antiga. O filtro é por
 * dia (`de`/`ate` em YYYY-MM-DD, no fuso do servidor): quem procura sabe o dia
 * em que apagou, não o horário.
 */
export async function listarBackupsRepo(filtro?: {
  de?: string;
  ate?: string;
}): Promise<ConversaBackupItem[]> {
  const de = diaInicio(filtro?.de);
  const ate = diaFim(filtro?.ate);

  const rows = await prisma.conversaBackup.findMany({
    where: {
      ...(de || ate ? { excluidoEm: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}),
    },
    include: { _count: { select: { mensagens: true } } },
    orderBy: { excluidoEm: "desc" },
    take: 300,
  });

  // O nome do cadastro vale mais que o pushName — mas só quando o lead ainda
  // existe; a conversa foi apagada, o lead não necessariamente.
  const personIds = [...new Set(rows.map((r) => r.personId).filter((id): id is string => !!id))];
  const pessoas = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, nome: true } })
    : [];
  const nomePorPessoa = new Map(pessoas.map((p) => [p.id, p.nome]));

  return rows.map((b) => ({
    id: b.id,
    conversaId: b.conversaId,
    nome: rotulo(b, b.personId ? nomePorPessoa.get(b.personId) : undefined),
    telefone: b.ehGrupo ? "" : formatarTelefone(b.telefone),
    ehGrupo: b.ehGrupo,
    interesse: b.interesse as ConversaInteresse,
    motivo: b.motivo as BackupMotivo,
    excluidoEm: b.excluidoEm.toISOString(),
    excluidoPor: b.excluidoPorNome,
    restauradoEm: b.restauradoEm?.toISOString() ?? null,
    mensagens: b._count.mensagens,
    preview: b.ultimaMensagemPreview,
  }));
}

/** "2026-08-03" → 00:00 daquele dia. Data inválida ou vazia não filtra nada. */
function diaInicio(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "2026-08-03" → 23:59:59.999 daquele dia, para o `ate` incluir o dia inteiro. */
function diaFim(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function obterMensagensBackupRepo(backupId: string) {
  const rows = await prisma.mensagemBackup.findMany({
    where: { backupId },
    orderBy: { enviadaEm: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    direcao: m.direcao as "IN" | "OUT",
    autor: m.autor as "LEAD" | "ATENDENTE",
    autorNome: null,
    remetente: m.remetente,
    texto: m.texto,
    tipoMidia: m.tipoMidia,
    enviadaEm: m.enviadaEm.toISOString(),
    erro: m.erro,
    // Na lixeira ninguém responde: citar está fora, e a citação vale só como
    // leitura — sem pulo para a original, que pode nem existir mais.
    citavel: false,
    citada: m.citadaWaId
      ? { id: null, texto: m.citadaTexto ?? "", autor: m.citadaAutor }
      : null,
  }));
}

// ─── Restauração ──────────────────────────────────────────────────────────────

export class BackupErro extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "BackupErro";
  }
}

export interface RestauracaoResultado {
  conversaId: string;
  mensagens: number; // quantas voltaram de fato
  ignoradas: number; // já estavam lá (restauração repetida ou "limpar" parcial)
}

/**
 * Devolve a conversa ao atendimento. Cobre os três estados possíveis:
 * a conversa nunca saiu ("limpar"), sumiu e nasceu outra no mesmo número, ou
 * sumiu de vez. Mensagem que já está lá é ignorada — restaurar duas vezes não
 * duplica o histórico.
 */
export async function restaurarBackupRepo(backupId: string): Promise<RestauracaoResultado> {
  const backup = await prisma.conversaBackup.findUnique({
    where: { id: backupId },
    include: { mensagens: { orderBy: { enviadaEm: "asc" } } },
  });
  if (!backup) throw new BackupErro("Backup não encontrado.", 404);
  if (backup.restauradoEm) throw new BackupErro("Este backup já foi restaurado.", 409);

  const instancia = await prisma.whatsappInstance.findUnique({
    where: { id: backup.instanceId },
    select: { id: true },
  });
  if (!instancia) {
    throw new BackupErro("A instância do WhatsApp dessa conversa não existe mais.", 409);
  }

  // O lead e o atendente podem ter sido apagados no meio do caminho; a conversa
  // volta sem o vínculo em vez de falhar a restauração.
  const personId = backup.personId
    ? ((await prisma.person.count({ where: { id: backup.personId } })) ? backup.personId : null)
    : null;
  const atendenteId = backup.atendenteId
    ? ((await prisma.user.count({ where: { id: backup.atendenteId } })) ? backup.atendenteId : null)
    : null;

  return prisma.$transaction(async (tx) => {
    // Conversa de destino: a original, se sobreviveu ("limpar"); senão a que
    // nasceu depois no mesmo número; senão recria com o id de origem.
    const original = await tx.conversa.findUnique({ where: { id: backup.conversaId } });
    const sucessora =
      original ??
      (await tx.conversa.findUnique({
        where: { instanceId_remoteJid: { instanceId: backup.instanceId, remoteJid: backup.remoteJid } },
      }));

    const destino =
      sucessora ??
      (await tx.conversa.create({
        data: {
          id: backup.conversaId,
          unitId: backup.unitId,
          instanceId: backup.instanceId,
          remoteJid: backup.remoteJid,
          telefone: backup.telefone,
          pushName: backup.pushName,
          ehGrupo: backup.ehGrupo,
          personId,
          atendenteId,
          interesse: backup.interesse,
          naoLidas: 0,
          ultimaMensagemEm: backup.ultimaMensagemEm,
          ultimaMensagemPreview: backup.ultimaMensagemPreview,
          criadoEm: backup.conversaCriadaEm,
        },
      }));

    // waMessageId é único no banco todo: o que já voltou (ou nunca saiu) fica
    // de fora, e a restauração continua com o resto.
    const jaExistem = new Set(
      (
        await tx.mensagem.findMany({
          where: { waMessageId: { in: backup.mensagens.map((m) => m.waMessageId) } },
          select: { waMessageId: true },
        })
      ).map((m) => m.waMessageId),
    );
    const faltando = backup.mensagens.filter((m) => !jaExistem.has(m.waMessageId));

    if (faltando.length) {
      await tx.mensagem.createMany({
        data: faltando.map((m) => ({
          // Só reaproveita o id de origem quando a conversa de destino é a
          // original; noutra conversa, um id repetido poderia colidir.
          ...(sucessora && sucessora.id !== backup.conversaId ? {} : { id: m.mensagemId }),
          conversaId: destino.id,
          waMessageId: m.waMessageId,
          direcao: m.direcao,
          autor: m.autor,
          autorUserId: m.autorUserId,
          remetente: m.remetente,
          texto: m.texto,
          tipoMidia: m.tipoMidia,
          enviadaEm: m.enviadaEm,
          erro: m.erro,
          citadaWaId: m.citadaWaId,
          citadaTexto: m.citadaTexto,
          citadaAutor: m.citadaAutor,
        })),
        skipDuplicates: true,
      });
    }

    // Cabeçalho da lista tem de refletir o histórico completo depois da volta.
    const ultima = await tx.mensagem.findFirst({
      where: { conversaId: destino.id },
      orderBy: { enviadaEm: "desc" },
      select: { texto: true, enviadaEm: true },
    });
    if (ultima) {
      await tx.conversa.update({
        where: { id: destino.id },
        data: {
          ultimaMensagemEm: ultima.enviadaEm,
          ultimaMensagemPreview: ultima.texto.slice(0, 140),
        },
      });
    }

    await tx.conversaBackup.update({
      where: { id: backup.id },
      data: { restauradoEm: new Date() },
    });

    return {
      conversaId: destino.id,
      mensagens: faltando.length,
      ignoradas: backup.mensagens.length - faltando.length,
    };
  });
}
