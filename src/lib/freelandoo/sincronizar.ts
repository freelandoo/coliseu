import { prisma } from "@/lib/db";
import {
  configFreelandoo,
  criarClienteFreelandoo,
  type ClienteFreelandoo,
  type ItemMembro,
} from "@/lib/freelandoo/cliente";
import {
  CAMPOS_SEM_CONTA,
  camposDoItem,
  marcarChaveFreelandoo,
  type CamposFreelandoo,
} from "@/lib/freelandoo/situacao";

/**
 * Sincronização Freelandoo → Coliseu (decisão Q13): a cada 10 min, em lote, e
 * ao abrir a ficha. Puxa foto, situação da conta e o treino ativo; guarda a
 * cópia local. Falha de rede mantém a cópia anterior.
 *
 * A listagem é COMPLETA: vínculo do Coliseu que não aparece nela é conta
 * apagada na Freelandoo (recusa dos termos) → volta a "sem conta".
 */

const LIMITE_PAGINA = 200;
const MAX_PAGINAS = 200;
/** Lista vazia com tantos vínculos locais = algo errado do outro lado; não apaga ninguém. */
const VINCULOS_PARA_DESCONFIAR = 5;

export interface Vinculado {
  id: string;
  freelandooUserId: string;
  /** Nulo = vínculo novo, ainda não visto numa listagem — não conta como apagado. */
  freelandooSincronizadoEm: Date | null;
}

export interface RepoSync {
  vinculados(): Promise<Vinculado[]>;
  /** Atualiza pelo id_user; se ninguém tem, pelo ref_externa (Person.id) ainda sem vínculo. */
  aplicar(item: ItemMembro, campos: CamposFreelandoo): Promise<boolean>;
  limpar(personIds: string[]): Promise<void>;
  marcarChave(situacao: "invalida" | "ok"): Promise<void>;
}

export interface ResumoSync {
  ok: boolean;
  erro?: string;
  itens: number;
  atualizados: number;
  apagados: number;
}

export async function sincronizarFreelandoo(
  deps: { cliente: ClienteFreelandoo; repo: RepoSync; agora: () => Date; configurado: boolean } = depsSyncPadrao(),
): Promise<ResumoSync> {
  if (!deps.configurado) return { ok: false, erro: "nao_configurado", itens: 0, atualizados: 0, apagados: 0 };
  const agora = deps.agora();

  const itens: ItemMembro[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await deps.cliente.listarMembros(cursor, LIMITE_PAGINA);
    if (!r.ok) {
      if (r.erro === "chave_invalida") await deps.repo.marcarChave("invalida");
      return { ok: false, erro: r.erro, itens: itens.length, atualizados: 0, apagados: 0 };
    }
    itens.push(...(r.dados.itens ?? []));
    cursor = r.dados.proximo_cursor ?? null;
    if (!cursor) break;
    if (pagina === MAX_PAGINAS - 1) {
      // listagem não terminou: sem a lista completa não dá para saber quem sumiu
      return { ok: false, erro: "listagem longa demais", itens: itens.length, atualizados: 0, apagados: 0 };
    }
  }
  await deps.repo.marcarChave("ok");

  const vinculados = await deps.repo.vinculados();
  const vistos = new Set<string>();
  let atualizados = 0;
  for (const item of itens) {
    if (!item?.id_user) continue;
    const idUser = String(item.id_user);
    vistos.add(idUser);
    try {
      if (await deps.repo.aplicar(item, camposDoItem(item, agora))) atualizados++;
    } catch (e) {
      // ex.: o mesmo id_user já ligado a outro cadastro — não derruba o lote
      console.error(`[freelandoo] sync do membro ${idUser} falhou:`, e);
    }
  }

  const sumidos = vinculados.filter((v) => !vistos.has(v.freelandooUserId) && v.freelandooSincronizadoEm);
  let apagados = 0;
  if (itens.length === 0 && vinculados.length >= VINCULOS_PARA_DESCONFIAR) {
    console.warn(`[freelandoo] listagem vazia com ${vinculados.length} vínculos locais — nada foi apagado`);
  } else if (sumidos.length > 0) {
    await deps.repo.limpar(sumidos.map((v) => v.id));
    apagados = sumidos.length;
  }
  return { ok: true, itens: itens.length, atualizados, apagados };
}

/**
 * Ao abrir a ficha: puxa só este aluno. Devolve false quando não deu para
 * falar com a Freelandoo (a tela mostra a cópia que já tinha).
 */
export async function sincronizarPessoaFreelandoo(
  personId: string,
  cliente: ClienteFreelandoo = criarClienteFreelandoo(),
  agora: Date = new Date(),
): Promise<boolean> {
  const p = await prisma.person.findUnique({ where: { id: personId }, select: { freelandooUserId: true } });
  if (!p?.freelandooUserId) return false;
  const r = await cliente.obterMembro(p.freelandooUserId);
  if (r.ok) {
    await prisma.person.update({ where: { id: personId }, data: camposDoItem(r.dados, agora) });
    return true;
  }
  if (r.erro === "nao_encontrado") {
    await prisma.person.update({ where: { id: personId }, data: CAMPOS_SEM_CONTA });
    return true;
  }
  if (r.erro === "chave_invalida") await marcarChaveFreelandoo("invalida").catch(() => false);
  return false;
}

export const repoSyncPrisma: RepoSync = {
  async vinculados() {
    const rows = await prisma.person.findMany({
      where: { freelandooUserId: { not: null } },
      select: { id: true, freelandooUserId: true, freelandooSincronizadoEm: true },
    });
    return rows.map((r) => ({ ...r, freelandooUserId: r.freelandooUserId! }));
  },
  async aplicar(item, campos) {
    const idUser = String(item.id_user);
    const r = await prisma.person.updateMany({ where: { freelandooUserId: idUser }, data: campos });
    if (r.count > 0) return true;
    if (!item.ref_externa) return false;
    const porRef = await prisma.person.updateMany({
      where: { id: String(item.ref_externa), freelandooUserId: null },
      data: campos,
    });
    return porRef.count > 0;
  },
  async limpar(personIds) {
    await prisma.person.updateMany({ where: { id: { in: personIds } }, data: CAMPOS_SEM_CONTA });
  },
  async marcarChave(situacao) {
    await marcarChaveFreelandoo(situacao);
  },
};

export function depsSyncPadrao() {
  const cfg = configFreelandoo();
  return {
    cliente: criarClienteFreelandoo(cfg),
    repo: repoSyncPrisma,
    agora: () => new Date(),
    configurado: cfg !== null,
  };
}
