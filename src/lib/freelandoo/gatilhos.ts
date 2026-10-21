import type { FreelandooEstado } from "@prisma/client";
import { prisma } from "@/lib/db";
import { carregarContextoAcesso } from "@/lib/access/context";
import { avaliarElegibilidade, type MotivoInelegivel } from "@/lib/freelandoo/elegibilidade";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";
import { enfileirarTarefaFreelandoo } from "@/lib/freelandoo/tarefas";

/**
 * Gatilhos da conta Freelandoo (catraca, matrícula, ficha): reavaliam a
 * elegibilidade e **só enfileiram** — nada aqui fala com a rede. A catraca
 * nunca espera a Freelandoo (decisão Q12).
 */

/** Estados em que a catraca/matrícula ainda tentam criar a conta sozinhas. */
const ESTADOS_AUTOMATICOS: FreelandooEstado[] = ["sem_conta", "falta_dado"];
/** O botão da ficha também reabre quem parou por dado ou por falha. */
const ESTADOS_MANUAIS: FreelandooEstado[] = ["sem_conta", "falta_dado", "menor", "conflito_email", "falhou"];

export type ResultadoGatilho =
  | { tipo: "enfileirado" }
  | { tipo: "inelegivel"; motivo: MotivoInelegivel }
  | { tipo: "ignorado"; porque: "nao_configurado" | "estado" | "pessoa" };

export async function avaliarContaFreelandoo(
  personId: string,
  opcoes: { manual?: boolean; agora?: Date } = {},
): Promise<ResultadoGatilho> {
  // Sem a chave nada acumula na fila: ligar a integração depois não pode
  // disparar uma rajada de boas-vindas de uma vez (protege o número).
  if (!freelandooConfigurado()) return { tipo: "ignorado", porque: "nao_configurado" };

  const pessoa = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true, nome: true, fase: true, cpf: true, email: true, dataNascimento: true,
      telefone: true, freelandooUserId: true, freelandooEstado: true, freelandooMotivo: true,
    },
  });
  if (!pessoa) return { tipo: "ignorado", porque: "pessoa" };
  const permitidos = opcoes.manual ? ESTADOS_MANUAIS : ESTADOS_AUTOMATICOS;
  if (pessoa.freelandooUserId || !permitidos.includes(pessoa.freelandooEstado)) {
    return { tipo: "ignorado", porque: "estado" };
  }

  // Lead/ex-aluno: nem carrega o contrato.
  const ctx = pessoa.fase === "aluno" ? (await carregarContextoAcesso(personId)).ctx : null;
  const r = avaliarElegibilidade(pessoa, ctx, opcoes.agora ?? new Date());

  if (r.elegivel) {
    if (pessoa.freelandooEstado !== "sem_conta" || pessoa.freelandooMotivo) {
      await prisma.person.update({
        where: { id: personId }, data: { freelandooEstado: "sem_conta", freelandooMotivo: null },
      });
    }
    await enfileirarTarefaFreelandoo(personId, "CRIAR_ACESSO");
    return { tipo: "enfileirado" };
  }

  if (r.estado && (r.estado !== pessoa.freelandooEstado || r.motivo !== pessoa.freelandooMotivo)) {
    await prisma.person.update({
      where: { id: personId }, data: { freelandooEstado: r.estado, freelandooMotivo: r.motivo },
    });
  }
  return { tipo: "inelegivel", motivo: r.motivo };
}

/**
 * Versão "nunca derruba quem chamou": catraca e matrícula não podem falhar
 * por causa da Freelandoo.
 */
export async function avaliarContaFreelandooSemFalhar(personId: string): Promise<void> {
  try {
    await avaliarContaFreelandoo(personId);
  } catch (e) {
    console.error("[freelandoo] gatilho falhou:", e);
  }
}
