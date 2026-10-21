import { Prisma, type FreelandooEstado, type TarefaFreelandooTipo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { carregarContextoAcesso } from "@/lib/access/context";
import { notificarAdmins } from "@/lib/notificacoes";
import {
  configFreelandoo,
  criarClienteFreelandoo,
  type ClienteFreelandoo,
} from "@/lib/freelandoo/cliente";
import { avaliarElegibilidade, type Elegibilidade } from "@/lib/freelandoo/elegibilidade";
import { enviarBoasVindas, type ResultadoBoasVindas } from "@/lib/freelandoo/boas-vindas";
import { enfileirarTarefaFreelandoo } from "@/lib/freelandoo/tarefas";
import {
  CAMPOS_SEM_CONTA,
  marcarChaveFreelandoo,
  type CamposFreelandoo,
} from "@/lib/freelandoo/situacao";

/**
 * Processador da fila Freelandoo — roda no agendador, a cada minuto
 * (decisão Q12). Pega até 20 tarefas vencidas, executa uma a uma e conclui.
 * Falha: +1 tentativa e de novo em 1 min; na 10ª, FALHOU + aviso no sino.
 * Chave de parceiro inválida (401/403) para o lote inteiro e acende o aviso
 * no painel do admin.
 *
 * Este módulo alcança o envio de WhatsApp (via boas-vindas). Por isso quem
 * dispara importa `tarefas.ts`, nunca este (ver `envio-automatico.test.ts`).
 */

export const LOTE_FILA = 20;
export const MAX_TENTATIVAS = 10;
export const ESPERA_RETENTATIVA_MS = 60_000;
/** Foto chegou antes da conta: espera sem gastar tentativa. */
export const ESPERA_FOTO_SEM_CONTA_MS = 60 * 60_000;
/** EM_ANDAMENTO há mais que isto = o processo caiu no meio; volta à fila. */
export const PRESA_APOS_MS = 10 * 60_000;

export interface TarefaLote {
  id: string;
  personId: string;
  tipo: TarefaFreelandooTipo;
  tentativas: number;
  payload: unknown;
}

export interface PessoaFila {
  id: string;
  nome: string;
  freelandooUserId: string | null;
  freelandooEstado: FreelandooEstado;
}

export interface RepoFila {
  recuperarPresas(antesDe: Date): Promise<void>;
  /** Marca EM_ANDAMENTO e devolve as tarefas pegas. */
  pegarLote(agora: Date, limite: number): Promise<TarefaLote[]>;
  concluir(id: string, agora: Date): Promise<void>;
  reagendar(id: string, dados: { tentativas: number; proximaEm: Date; erro: string | null }): Promise<void>;
  falhar(id: string, dados: { tentativas: number; erro: string }, agora: Date): Promise<void>;
  /** Devolve à fila sem contar tentativa (lote interrompido). */
  devolver(ids: string[]): Promise<void>;
  pessoa(personId: string): Promise<PessoaFila | null>;
  avaliar(personId: string, agora: Date): Promise<{ pessoa: PessoaFila; elegibilidade: Elegibilidade } | null>;
  atualizarPessoa(personId: string, campos: CamposFreelandoo): Promise<void>;
  enfileirar(personId: string, tipo: TarefaFreelandooTipo, payload?: Prisma.InputJsonValue): Promise<void>;
  /** Conta criada/vinculada: a foto que esperava sai já no próximo minuto. */
  anteciparFotos(personId: string, agora: Date): Promise<void>;
  marcarChave(situacao: "invalida" | "ok"): Promise<void>;
  notificarFalha(pessoa: { id: string; nome: string }, tipo: TarefaFreelandooTipo, erro: string, tarefaId: string): Promise<void>;
}

export interface DepsFila {
  repo: RepoFila;
  cliente: ClienteFreelandoo;
  enviarBoasVindas: (input: { personId: string; link: string }) => Promise<ResultadoBoasVindas>;
  agora: () => Date;
  configurado: boolean;
}

export type Desfecho =
  | { tipo: "ok" }
  | { tipo: "retentar"; erro: string }
  /** Erro de dado (e-mail em uso, CPF recusado…): repetir não resolve. */
  | { tipo: "desistir"; erro: string }
  | { tipo: "adiar"; ate: Date }
  | { tipo: "chave_invalida" };

export interface ResumoFila {
  pulou: boolean;
  processadas: number;
  ok: number;
  reagendadas: number;
  falharam: number;
  parouPorChave: boolean;
}

const OK: Desfecho = { tipo: "ok" };

function payloadDe<T extends object>(t: TarefaLote): Partial<T> {
  return t.payload && typeof t.payload === "object" ? (t.payload as Partial<T>) : {};
}

async function criarAcesso(t: TarefaLote, deps: DepsFila, agora: Date): Promise<Desfecho> {
  const { repo, cliente } = deps;
  const av = await repo.avaliar(t.personId, agora);
  if (!av || av.pessoa.freelandooUserId) return OK; // apagada ou já vinculada
  const el = av.elegibilidade;
  if (!el.elegivel) {
    // O cadastro mudou entre o gatilho e agora: registra e encerra.
    if (el.estado) await repo.atualizarPessoa(t.personId, { freelandooEstado: el.estado, freelandooMotivo: el.motivo });
    return OK;
  }

  const r = await cliente.criarMembro(el.dados);
  if (r.ok) {
    if (r.dados.status === "criado") {
      await repo.atualizarPessoa(t.personId, {
        freelandooUserId: String(r.dados.id_user), freelandooEstado: "aguardando_aceite",
        freelandooMotivo: null, freelandooAcessoEnviadoEm: null, freelandooSincronizadoEm: null,
      });
      await repo.enfileirar(t.personId, "ENVIAR_BOAS_VINDAS", {
        link: r.dados.link_primeiro_acesso, expira_em: r.dados.expira_em,
      });
    } else {
      // CPF já tinha conta: só vincula, sem senha nova e sem mensagem (Q2).
      await repo.atualizarPessoa(t.personId, {
        freelandooUserId: String(r.dados.id_user),
        freelandooEstado: r.dados.estado === "ativa" ? "ativa" : "aguardando_aceite",
        freelandooMotivo: null, freelandooSincronizadoEm: null,
      });
    }
    await repo.anteciparFotos(t.personId, agora);
    return OK;
  }

  switch (r.erro) {
    case "chave_invalida":
      return { tipo: "chave_invalida" };
    case "cpf_invalido":
    case "dados_incompletos":
      await repo.atualizarPessoa(t.personId, { freelandooEstado: "falta_dado", freelandooMotivo: r.erro });
      return { tipo: "desistir", erro: r.erro };
    case "menor_de_idade":
      await repo.atualizarPessoa(t.personId, { freelandooEstado: "menor", freelandooMotivo: "menor" });
      return { tipo: "desistir", erro: r.erro };
    case "email_em_uso":
      await repo.atualizarPessoa(t.personId, { freelandooEstado: "conflito_email", freelandooMotivo: "email_em_uso" });
      return { tipo: "desistir", erro: r.erro };
    default:
      return { tipo: "retentar", erro: r.detalhe ? `${r.erro}: ${r.detalhe}` : r.erro };
  }
}

async function enviarBoasVindasTarefa(t: TarefaLote, deps: DepsFila, agora: Date): Promise<Desfecho> {
  const link = payloadDe<{ link: string }>(t).link;
  if (!link) return { tipo: "desistir", erro: "tarefa sem link de primeiro acesso" };
  const pessoa = await deps.repo.pessoa(t.personId);
  if (!pessoa || !pessoa.freelandooUserId) return OK; // conta sumiu: nada a mandar
  if (pessoa.freelandooEstado === "ativa") return OK; // já aceitou: o link não serve mais

  const r = await deps.enviarBoasVindas({ personId: t.personId, link });
  switch (r.tipo) {
    case "enviado":
      await deps.repo.atualizarPessoa(t.personId, { freelandooAcessoEnviadoEm: agora });
      return OK;
    case "sem_telefone":
    case "nao_configurado":
      // Não é falha: a ficha mostra "acesso não enviado" e o botão de reenviar.
      return OK;
    case "falha":
      return r.transitoria ? { tipo: "retentar", erro: r.erro } : { tipo: "desistir", erro: r.erro };
  }
}

async function reenviarLink(t: TarefaLote, deps: DepsFila): Promise<Desfecho> {
  const pessoa = await deps.repo.pessoa(t.personId);
  if (!pessoa) return OK;
  if (!pessoa.freelandooUserId) return { tipo: "desistir", erro: "aluno ainda sem conta na Freelandoo" };

  const r = await deps.cliente.novoLink(pessoa.freelandooUserId);
  if (r.ok) {
    // O envio vira a tarefa de boas-vindas: se o WhatsApp falhar, a fila repete
    // o envio com ESTE link, sem pedir outro (cada pedido invalida o anterior).
    await deps.repo.enfileirar(t.personId, "ENVIAR_BOAS_VINDAS", {
      link: r.dados.link_primeiro_acesso, expira_em: r.dados.expira_em,
    });
    return OK;
  }
  switch (r.erro) {
    case "chave_invalida":
      return { tipo: "chave_invalida" };
    case "ja_aceito":
      await deps.repo.atualizarPessoa(t.personId, { freelandooEstado: "ativa" });
      return OK;
    case "nao_encontrado":
      await deps.repo.atualizarPessoa(t.personId, CAMPOS_SEM_CONTA);
      return OK;
    default:
      return { tipo: "retentar", erro: r.detalhe ? `${r.erro}: ${r.detalhe}` : r.erro };
  }
}

const ESTADOS_COM_CONTA: FreelandooEstado[] = ["aguardando_aceite", "ativa"];

async function enviarFoto(t: TarefaLote, deps: DepsFila, agora: Date): Promise<Desfecho> {
  const imagem = payloadDe<{ imagem: string }>(t).imagem;
  if (!imagem) return { tipo: "desistir", erro: "tarefa sem imagem" };
  const pessoa = await deps.repo.pessoa(t.personId);
  if (!pessoa) return OK;
  if (!pessoa.freelandooUserId || !ESTADOS_COM_CONTA.includes(pessoa.freelandooEstado)) {
    return { tipo: "adiar", ate: new Date(agora.getTime() + ESPERA_FOTO_SEM_CONTA_MS) };
  }
  const r = await deps.cliente.enviarFotoAcademia(pessoa.freelandooUserId, Buffer.from(imagem, "base64"));
  if (r.ok) return OK;
  switch (r.erro) {
    case "chave_invalida":
      return { tipo: "chave_invalida" };
    case "nao_encontrado":
      return { tipo: "desistir", erro: "conta não encontrada na Freelandoo" };
    default:
      return { tipo: "retentar", erro: r.detalhe ? `${r.erro}: ${r.detalhe}` : r.erro };
  }
}

export async function executarTarefa(t: TarefaLote, deps: DepsFila, agora: Date): Promise<Desfecho> {
  switch (t.tipo) {
    case "CRIAR_ACESSO":
      return criarAcesso(t, deps, agora);
    case "ENVIAR_BOAS_VINDAS":
      return enviarBoasVindasTarefa(t, deps, agora);
    case "REENVIAR_LINK":
      return reenviarLink(t, deps);
    case "ENVIAR_FOTO":
      return enviarFoto(t, deps, agora);
  }
}

function ehUnicoDuplicado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function processarFila(deps: DepsFila = depsPadrao()): Promise<ResumoFila> {
  const resumo: ResumoFila = { pulou: false, processadas: 0, ok: 0, reagendadas: 0, falharam: 0, parouPorChave: false };
  if (!deps.configurado) return { ...resumo, pulou: true };
  const { repo } = deps;
  const agora = deps.agora();

  await repo.recuperarPresas(new Date(agora.getTime() - PRESA_APOS_MS));
  const lote = await repo.pegarLote(agora, LOTE_FILA);

  for (let i = 0; i < lote.length; i++) {
    const t = lote[i];
    let d: Desfecho;
    try {
      d = await executarTarefa(t, deps, agora);
    } catch (e) {
      d = ehUnicoDuplicado(e)
        ? { tipo: "desistir", erro: "esta conta Freelandoo já está ligada a outro cadastro do Coliseu" }
        : { tipo: "retentar", erro: e instanceof Error ? e.message.slice(0, 300) : "erro inesperado" };
    }

    if (d.tipo === "chave_invalida") {
      // Para tudo: as outras tarefas falhariam igual e gastariam tentativa à toa.
      await repo.devolver(lote.slice(i).map((x) => x.id));
      await repo.marcarChave("invalida");
      resumo.parouPorChave = true;
      break;
    }

    resumo.processadas++;
    if (d.tipo === "ok") {
      await repo.concluir(t.id, agora);
      resumo.ok++;
    } else if (d.tipo === "adiar") {
      await repo.reagendar(t.id, { tentativas: t.tentativas, proximaEm: d.ate, erro: null });
      resumo.reagendadas++;
    } else if (d.tipo === "desistir") {
      await repo.falhar(t.id, { tentativas: t.tentativas + 1, erro: d.erro }, agora);
      resumo.falharam++;
    } else {
      const tentativas = t.tentativas + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        await repo.falhar(t.id, { tentativas, erro: d.erro }, agora);
        if (t.tipo === "CRIAR_ACESSO") {
          await repo.atualizarPessoa(t.personId, { freelandooEstado: "falhou", freelandooMotivo: null });
        }
        const pessoa = await repo.pessoa(t.personId);
        if (pessoa) await repo.notificarFalha(pessoa, t.tipo, d.erro, t.id);
        resumo.falharam++;
      } else {
        await repo.reagendar(t.id, {
          tentativas, proximaEm: new Date(agora.getTime() + ESPERA_RETENTATIVA_MS), erro: d.erro,
        });
        resumo.reagendadas++;
      }
    }
  }

  if (resumo.ok > 0 && !resumo.parouPorChave) await repo.marcarChave("ok");
  return resumo;
}

// ─── Implementação com Prisma ─────────────────────────────────────────────────

const SELECT_PESSOA = {
  id: true, nome: true, freelandooUserId: true, freelandooEstado: true,
} satisfies Prisma.PersonSelect;

const ROTULO_TAREFA: Record<TarefaFreelandooTipo, string> = {
  CRIAR_ACESSO: "criar a conta",
  ENVIAR_BOAS_VINDAS: "enviar o acesso no WhatsApp",
  REENVIAR_LINK: "gerar um link novo",
  ENVIAR_FOTO: "enviar a foto",
};

export const repoFilaPrisma: RepoFila = {
  async recuperarPresas(antesDe) {
    await prisma.tarefaFreelandoo.updateMany({
      where: { status: "EM_ANDAMENTO", proximaEm: { lt: antesDe } },
      data: { status: "PENDENTE" },
    });
  },
  async pegarLote(agora, limite) {
    const pendentes = await prisma.tarefaFreelandoo.findMany({
      where: { status: "PENDENTE", proximaEm: { lte: agora } },
      orderBy: [{ proximaEm: "asc" }, { criadoEm: "asc" }],
      take: limite,
      select: { id: true, personId: true, tipo: true, tentativas: true, payload: true },
    });
    if (pendentes.length === 0) return [];
    // proximaEm = agora marca o início (recuperarPresas mede a partir daqui).
    await prisma.tarefaFreelandoo.updateMany({
      where: { id: { in: pendentes.map((t) => t.id) }, status: "PENDENTE" },
      data: { status: "EM_ANDAMENTO", proximaEm: agora },
    });
    return pendentes;
  },
  async concluir(id, agora) {
    // A foto só fica guardada até o envio.
    await prisma.tarefaFreelandoo.update({
      where: { id },
      data: { status: "OK", concluidoEm: agora, ultimoErro: null, payload: Prisma.DbNull },
    });
  },
  async reagendar(id, d) {
    await prisma.tarefaFreelandoo.update({
      where: { id },
      data: { status: "PENDENTE", tentativas: d.tentativas, proximaEm: d.proximaEm, ultimoErro: d.erro },
    });
  },
  async falhar(id, d, agora) {
    await prisma.tarefaFreelandoo.update({
      where: { id },
      data: { status: "FALHOU", tentativas: d.tentativas, ultimoErro: d.erro.slice(0, 500), concluidoEm: agora },
    });
  },
  async devolver(ids) {
    if (ids.length === 0) return;
    await prisma.tarefaFreelandoo.updateMany({
      where: { id: { in: ids }, status: "EM_ANDAMENTO" },
      data: { status: "PENDENTE", ultimoErro: "chave de parceiro inválida" },
    });
  },
  async pessoa(personId) {
    return prisma.person.findUnique({ where: { id: personId }, select: SELECT_PESSOA });
  },
  async avaliar(personId, agora) {
    const p = await prisma.person.findUnique({
      where: { id: personId },
      select: { ...SELECT_PESSOA, fase: true, cpf: true, email: true, dataNascimento: true, telefone: true },
    });
    if (!p) return null;
    const ctx = p.fase === "aluno" ? (await carregarContextoAcesso(personId)).ctx : null;
    return { pessoa: p, elegibilidade: avaliarElegibilidade(p, ctx, agora) };
  },
  async atualizarPessoa(personId, campos) {
    await prisma.person.update({ where: { id: personId }, data: campos });
  },
  async enfileirar(personId, tipo, payload) {
    await enfileirarTarefaFreelandoo(personId, tipo, payload);
  },
  async anteciparFotos(personId, agora) {
    await prisma.tarefaFreelandoo.updateMany({
      where: { personId, tipo: "ENVIAR_FOTO", status: "PENDENTE", proximaEm: { gt: agora } },
      data: { proximaEm: agora },
    });
  },
  async marcarChave(situacao) {
    const mudou = await marcarChaveFreelandoo(situacao);
    if (mudou && situacao === "invalida") {
      await notificarAdmins({
        tipo: "freelandoo_chave_invalida",
        titulo: "Freelandoo: chave de parceiro inválida",
        corpo: "A fila de contas da Freelandoo parou. Confira FREELANDOO_PARTNER_KEY no Railway.",
        url: "/painel",
        chave: `freelandoo-chave:${new Date().toISOString().slice(0, 13)}`,
      }).catch((e) => console.error("[freelandoo] aviso de chave falhou:", e));
    }
  },
  async notificarFalha(pessoa, tipo, erro, tarefaId) {
    await notificarAdmins({
      tipo: "freelandoo_falhou",
      titulo: `Freelandoo: não deu para ${ROTULO_TAREFA[tipo]}`,
      corpo: `${pessoa.nome}: ${erro}`.slice(0, 240),
      url: `/matriculados/${pessoa.id}`,
      chave: `freelandoo-falhou:${tarefaId}:${Date.now()}`,
    }).catch((e) => console.error("[freelandoo] notificação de falha falhou:", e));
  },
};

export function depsPadrao(): DepsFila {
  const cfg = configFreelandoo();
  return {
    repo: repoFilaPrisma,
    cliente: criarClienteFreelandoo(cfg),
    enviarBoasVindas,
    agora: () => new Date(),
    configurado: cfg !== null,
  };
}
