import type { FreelandooEstado, TarefaFreelandooStatus, TarefaFreelandooTipo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";
import { avaliarContaFreelandoo, type ResultadoGatilho } from "@/lib/freelandoo/gatilhos";
import { enfileirarTarefaFreelandoo } from "@/lib/freelandoo/tarefas";

/**
 * A seção "Freelandoo" da ficha: o que a tela mostra e o que os botões fazem.
 * Só banco (os botões enfileiram; o envio sai pela fila).
 */

export interface TarefaResumo {
  tipo: TarefaFreelandooTipo;
  status: TarefaFreelandooStatus;
  tentativas: number;
  ultimoErro: string | null;
  proximaEm: string;
}

export interface ContaFreelandoo {
  configurado: boolean;
  estado: FreelandooEstado;
  motivo: string | null;
  vinculado: boolean;
  fotoUrl: string | null;
  treino: { nome: string | null; venceEm: string | null; validadeDias: number | null } | null;
  sincronizadoEm: string | null;
  acessoEnviadoEm: string | null;
  /** Algo na fila agora (PENDENTE/EM_ANDAMENTO). */
  emAndamento: TarefaResumo[];
  /** Última tarefa que falhou de vez, se ainda não foi refeita. */
  falha: TarefaResumo | null;
}

function resumo(t: {
  tipo: TarefaFreelandooTipo; status: TarefaFreelandooStatus; tentativas: number; ultimoErro: string | null; proximaEm: Date;
}): TarefaResumo {
  return { tipo: t.tipo, status: t.status, tentativas: t.tentativas, ultimoErro: t.ultimoErro, proximaEm: t.proximaEm.toISOString() };
}

export async function contaFreelandooDaPessoa(personId: string): Promise<ContaFreelandoo | null> {
  const p = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      freelandooUserId: true, freelandooEstado: true, freelandooMotivo: true, freelandooFotoUrl: true,
      freelandooTreinoNome: true, freelandooTreinoVenceEm: true, freelandooTreinoValidadeDias: true,
      freelandooSincronizadoEm: true, freelandooAcessoEnviadoEm: true,
      tarefasFreelandoo: {
        where: { status: { in: ["PENDENTE", "EM_ANDAMENTO", "FALHOU"] } },
        orderBy: { criadoEm: "desc" },
        take: 10,
        select: { tipo: true, status: true, tentativas: true, ultimoErro: true, proximaEm: true, concluidoEm: true },
      },
    },
  });
  if (!p) return null;
  const tarefas = p.tarefasFreelandoo;
  const falhou = tarefas
    .filter((t) => t.status === "FALHOU")
    .sort((a, b) => (b.concluidoEm?.getTime() ?? 0) - (a.concluidoEm?.getTime() ?? 0))[0];
  const temTreino = p.freelandooTreinoNome || p.freelandooTreinoVenceEm;
  return {
    configurado: freelandooConfigurado(),
    estado: p.freelandooEstado,
    motivo: p.freelandooMotivo,
    vinculado: Boolean(p.freelandooUserId),
    fotoUrl: p.freelandooFotoUrl,
    treino: temTreino
      ? {
          nome: p.freelandooTreinoNome,
          venceEm: p.freelandooTreinoVenceEm?.toISOString() ?? null,
          validadeDias: p.freelandooTreinoValidadeDias,
        }
      : null,
    sincronizadoEm: p.freelandooSincronizadoEm?.toISOString() ?? null,
    acessoEnviadoEm: p.freelandooAcessoEnviadoEm?.toISOString() ?? null,
    emAndamento: tarefas.filter((t) => t.status !== "FALHOU").map(resumo),
    falha: falhou ? resumo(falhou) : null,
  };
}

export type AcaoFicha = "criar" | "reenviar" | "tentar_de_novo";

export type ResultadoAcao =
  | { ok: true; mensagem: string }
  | { ok: false; status: number; erro: string };

const MENSAGEM_INELEGIVEL: Record<string, string> = {
  nao_e_aluno: "Só alunos ganham conta na Freelandoo.",
  matricula_invalida: "A matrícula não está válida — regularize antes de criar o acesso.",
  falta_cpf: "Falta o CPF no cadastro.",
  cpf_invalido: "O CPF do cadastro é inválido.",
  falta_email: "Falta o e-mail no cadastro.",
  falta_nascimento: "Falta a data de nascimento no cadastro.",
  menor: "Menor de idade: a conta pelo responsável fica para uma fase futura.",
  ja_vinculado: "Este aluno já tem conta na Freelandoo.",
};

function respostaGatilho(r: ResultadoGatilho): ResultadoAcao {
  if (r.tipo === "enfileirado") return { ok: true, mensagem: "Criação do acesso na fila. Sai em até um minuto." };
  if (r.tipo === "inelegivel") return { ok: false, status: 422, erro: MENSAGEM_INELEGIVEL[r.motivo] ?? r.motivo };
  if (r.porque === "nao_configurado") return { ok: false, status: 503, erro: "Integração com a Freelandoo não configurada." };
  if (r.porque === "pessoa") return { ok: false, status: 404, erro: "Pessoa não encontrada" };
  return { ok: false, status: 409, erro: "Este aluno já tem conta na Freelandoo." };
}

export async function executarAcaoFicha(personId: string, acao: AcaoFicha): Promise<ResultadoAcao> {
  if (!freelandooConfigurado()) return { ok: false, status: 503, erro: "Integração com a Freelandoo não configurada." };
  const p = await prisma.person.findUnique({
    where: { id: personId },
    select: { freelandooUserId: true, freelandooEstado: true },
  });
  if (!p) return { ok: false, status: 404, erro: "Pessoa não encontrada" };

  if (acao === "criar") return respostaGatilho(await avaliarContaFreelandoo(personId, { manual: true }));

  if (acao === "reenviar") {
    if (!p.freelandooUserId) return { ok: false, status: 409, erro: "O aluno ainda não tem conta — use Criar acesso." };
    if (p.freelandooEstado === "ativa") {
      return { ok: false, status: 409, erro: "O aluno já criou a senha; o acesso é pelo login da Freelandoo." };
    }
    await enfileirarTarefaFreelandoo(personId, "REENVIAR_LINK");
    return { ok: true, mensagem: "Link novo na fila. A mensagem sai em até um minuto." };
  }

  // tentar_de_novo: refaz o que parou de vez.
  if (!p.freelandooUserId) return respostaGatilho(await avaliarContaFreelandoo(personId, { manual: true }));
  const falhas = await prisma.tarefaFreelandoo.findMany({
    where: { personId, status: "FALHOU" },
    select: { tipo: true },
  });
  const tipos = new Set(falhas.map((f) => f.tipo));
  if (tipos.size === 0) return { ok: false, status: 409, erro: "Nada parado para refazer." };
  // Boas-vindas que falhou pode estar com o link vencido: pede um novo.
  if (tipos.has("ENVIAR_BOAS_VINDAS") || tipos.has("REENVIAR_LINK")) {
    if (p.freelandooEstado !== "ativa") await enfileirarTarefaFreelandoo(personId, "REENVIAR_LINK");
  }
  if (tipos.has("ENVIAR_FOTO")) await enfileirarTarefaFreelandoo(personId, "ENVIAR_FOTO");
  // Os registros antigos de falha saem da ficha.
  await prisma.tarefaFreelandoo.updateMany({
    where: { personId, status: "FALHOU", tipo: { in: ["ENVIAR_BOAS_VINDAS", "REENVIAR_LINK"] } },
    data: { status: "OK", ultimoErro: null },
  });
  return { ok: true, mensagem: "Na fila de novo. Sai em até um minuto." };
}
