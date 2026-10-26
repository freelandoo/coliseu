import type { FreelandooEstado, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ItemMembro } from "@/lib/freelandoo/cliente";

/**
 * Estado local da integração Freelandoo: a cópia que o Coliseu guarda de cada
 * conta e o aviso de "chave de parceiro inválida" do painel. Só banco.
 */

/** Campos da Person que a integração escreve. */
export type CamposFreelandoo = {
  freelandooUserId?: string | null;
  freelandooEstado?: FreelandooEstado;
  freelandooMotivo?: string | null;
  freelandooFotoUrl?: string | null;
  freelandooTreinoNome?: string | null;
  freelandooTreinoVenceEm?: Date | null;
  freelandooTreinoValidadeDias?: number | null;
  freelandooTreinoPropostaPendente?: boolean;
  freelandooSincronizadoEm?: Date | null;
  freelandooAcessoEnviadoEm?: Date | null;
};

/** Conta apagada na Freelandoo (recusa dos termos ou exclusão): volta ao início. */
export const CAMPOS_SEM_CONTA: CamposFreelandoo = {
  freelandooUserId: null,
  freelandooEstado: "sem_conta",
  freelandooMotivo: null,
  freelandooFotoUrl: null,
  freelandooTreinoNome: null,
  freelandooTreinoVenceEm: null,
  freelandooTreinoValidadeDias: null,
  freelandooTreinoPropostaPendente: false,
  freelandooSincronizadoEm: null,
  freelandooAcessoEnviadoEm: null,
};

function dataOuNull(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Item do GET /partner/v1/members → campos da cópia local. */
export function camposDoItem(item: ItemMembro, agora: Date): CamposFreelandoo {
  return {
    freelandooUserId: String(item.id_user),
    freelandooEstado: item.estado === "ativa" ? "ativa" : "aguardando_aceite",
    freelandooMotivo: null,
    freelandooFotoUrl: item.avatar_url || null,
    freelandooTreinoNome: item.treino?.nome ?? null,
    freelandooTreinoVenceEm: dataOuNull(item.treino?.vence_em),
    freelandooTreinoValidadeDias: item.treino?.validade_dias ?? null,
    freelandooTreinoPropostaPendente: item.proposta_treino_pendente === true,
    freelandooSincronizadoEm: agora,
  };
}

// ─── Aviso de chave inválida (painel do admin) ───────────────────────────────

const ENTIDADE = "IntegracaoFreelandoo";
const CHAVE_INVALIDA = "FREELANDOO_CHAVE_INVALIDA";
const CHAVE_OK = "FREELANDOO_CHAVE_OK";

export interface SituacaoChave {
  configurada: boolean;
  invalida: boolean;
  desde: string | null;
}

async function ultimoAvisoChave() {
  return prisma.auditLog.findFirst({
    where: { entity: ENTIDADE, action: { in: [CHAVE_INVALIDA, CHAVE_OK] } },
    orderBy: { at: "desc" },
    select: { action: true, at: true },
  });
}

/**
 * Grava a mudança de situação da chave (só a transição: a fila tentando a
 * cada minuto não enche o AuditLog). Devolve true quando mudou.
 */
export async function marcarChaveFreelandoo(situacao: "invalida" | "ok"): Promise<boolean> {
  const ultimo = await ultimoAvisoChave();
  const atual = ultimo?.action === CHAVE_INVALIDA ? "invalida" : "ok";
  if (atual === situacao) return false;
  await prisma.auditLog.create({
    data: {
      actorType: "SYSTEM", action: situacao === "invalida" ? CHAVE_INVALIDA : CHAVE_OK,
      entity: ENTIDADE, after: { em: new Date().toISOString() } as Prisma.InputJsonValue,
    },
  });
  return true;
}

export async function situacaoChaveFreelandoo(configurada: boolean): Promise<SituacaoChave> {
  const ultimo = await ultimoAvisoChave();
  const invalida = ultimo?.action === CHAVE_INVALIDA;
  return { configurada, invalida, desde: invalida && ultimo ? ultimo.at.toISOString() : null };
}
