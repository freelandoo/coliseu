import { Prisma, type TarefaFreelandooTipo } from "@prisma/client";
import { prisma } from "@/lib/db";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";

/**
 * Enfileirar tarefas da integração Freelandoo — só banco, nunca rede.
 *
 * Quem dispara (catraca, matrícula, ficha, ack do cadastro de face) importa
 * ESTE módulo, e não `fila.ts`: o processador alcança o envio de WhatsApp
 * (boas-vindas) e a catraca não pode alcançar (ver `envio-automatico.test.ts`).
 */

/** Teto da foto guardada na tarefa até o envio (base64 de um jpeg do iDFace). */
export const LIMITE_FOTO_BASE64 = 1_400_000; // ~1 MB de jpeg

export function chaveTarefa(tipo: TarefaFreelandooTipo, personId: string, agora: Date = new Date()): string {
  switch (tipo) {
    case "CRIAR_ACESSO":
      return `criar:${personId}`;
    case "ENVIAR_BOAS_VINDAS":
      return `boas-vindas:${personId}`;
    case "ENVIAR_FOTO":
      return `foto:${personId}`;
    case "REENVIAR_LINK":
      // um reenvio por minuto: dois cliques seguidos não geram dois links
      return `reenviar:${personId}:${Math.floor(agora.getTime() / 60_000)}`;
  }
}

/**
 * Enfileira (idempotente pela `dedupeKey`):
 * - não existe → cria PENDENTE;
 * - PENDENTE → só troca o payload, se veio um novo (foto mais recente, link novo);
 * - OK/FALHOU → volta a PENDENTE do zero (conta recriada, "Tentar de novo");
 * - EM_ANDAMENTO → deixa (o processador está nela agora).
 */
export async function enfileirarTarefaFreelandoo(
  personId: string,
  tipo: TarefaFreelandooTipo,
  payload?: Prisma.InputJsonValue,
  agora: Date = new Date(),
): Promise<{ id: string; criada: boolean }> {
  const dedupeKey = chaveTarefa(tipo, personId, agora);
  const existente = await prisma.tarefaFreelandoo.findUnique({ where: { dedupeKey } });
  if (!existente) {
    try {
      const nova = await prisma.tarefaFreelandoo.create({
        data: { personId, tipo, dedupeKey, proximaEm: agora, ...(payload !== undefined ? { payload } : {}) },
        select: { id: true },
      });
      return { id: nova.id, criada: true };
    } catch (e) {
      // corrida com outro gatilho: a outra criou primeiro — vale a dela
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const ja = await prisma.tarefaFreelandoo.findUnique({ where: { dedupeKey }, select: { id: true } });
        if (ja) return { id: ja.id, criada: false };
      }
      throw e;
    }
  }
  if (existente.status === "OK" || existente.status === "FALHOU") {
    await prisma.tarefaFreelandoo.updateMany({
      where: { id: existente.id, status: { in: ["OK", "FALHOU"] } },
      data: {
        status: "PENDENTE", tentativas: 0, proximaEm: agora, ultimoErro: null, concluidoEm: null,
        ...(payload !== undefined ? { payload } : {}),
      },
    });
    return { id: existente.id, criada: true };
  }
  if (existente.status === "PENDENTE" && payload !== undefined) {
    await prisma.tarefaFreelandoo.update({ where: { id: existente.id }, data: { payload } });
  }
  return { id: existente.id, criada: false };
}

/**
 * Foto do cadastro de face (ack do ENROLL). Grande demais = descartada. Sem a
 * integração configurada nem guarda: imagem de rosto não fica no banco à toa.
 */
export async function enfileirarFotoFreelandoo(personId: string, base64: string): Promise<boolean> {
  if (!freelandooConfigurado()) return false;
  const limpo = base64.replace(/^data:image\/\w+;base64,/, "").trim();
  if (!limpo || limpo.length > LIMITE_FOTO_BASE64 || !/^[A-Za-z0-9+/=\s]+$/.test(limpo)) return false;
  await enfileirarTarefaFreelandoo(personId, "ENVIAR_FOTO", { imagem: limpo });
  return true;
}
