import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { registrarMensagemRepo } from "@/lib/repositories/whatsapp";
import { chaveTelefone } from "@/lib/whatsapp/telefone";
import { configEvolution, enviarTexto, EvolutionError } from "@/lib/whatsapp/evolution";
import { telefoneComDdi } from "@/lib/freelandoo/elegibilidade";
import { hojeNaAcademia, horaNaAcademia, mensagemLembreteAula, somarDias } from "@/lib/aula-experimental";

/**
 * SEGUNDA exceção à regra "nada é enviado sozinho" (pedido do Alex,
 * 26/10/2026): o lembrete da aula experimental, uma vez por aula, pela conversa
 * da pessoa no Atendimento. A primeira é a boas-vindas da Freelandoo.
 *
 * Travado por `lib/freelandoo/envio-automatico.test.ts`: só o agendador chama
 * este módulo; nenhuma mensagem recebida dispara envio.
 *
 * Quando: na véspera, das 9h às 20h (relógio da academia). Aula marcada para
 * hoje antes de hoje e que ficou sem lembrete (WhatsApp caído na véspera)
 * recebe no dia, se ainda falta mais de uma hora. Aula marcada hoje para hoje
 * não — a confirmação acabou de sair. Falta marcada não recebe.
 */

const JANELA = { de: 9, ate: 20 };
/** Prefixo de erro que não adianta repetir (número inválido, recusado). */
const DEFINITIVO = "definitivo: ";

export function lembreteLigado(): boolean {
  return process.env.LEMBRETE_AULA_EXPERIMENTAL !== "desligado";
}

async function conversaDaAula(input: {
  instanceId: string;
  unitId: string;
  conversaId: string | null;
  personId: string | null;
  telefone: string;
}): Promise<string> {
  if (input.conversaId) {
    const c = await prisma.conversa.findUnique({ where: { id: input.conversaId }, select: { id: true, instanceId: true } });
    if (c?.instanceId === input.instanceId) return c.id;
  }
  const chave = chaveTelefone(input.telefone);
  const candidatas = await prisma.conversa.findMany({
    where: { instanceId: input.instanceId, ehGrupo: false, telefone: { endsWith: chave } },
    select: { id: true, personId: true },
    orderBy: { ultimaMensagemEm: "desc" },
  });
  const dela = candidatas.find((c) => input.personId && c.personId === input.personId) ?? candidatas[0];
  if (dela) return dela.id;

  const remoteJid = `${input.telefone}@s.whatsapp.net`;
  try {
    const nova = await prisma.conversa.create({
      data: { unitId: input.unitId, instanceId: input.instanceId, remoteJid, telefone: input.telefone, personId: input.personId },
      select: { id: true },
    });
    return nova.id;
  } catch {
    const ja = await prisma.conversa.findUnique({
      where: { instanceId_remoteJid: { instanceId: input.instanceId, remoteJid } },
      select: { id: true },
    });
    if (ja) return ja.id;
    throw new Error("não foi possível abrir a conversa");
  }
}

export interface ResumoLembretes {
  candidatas: number;
  enviados: number;
  falhas: number;
}

export async function enviarLembretesAula(agora = new Date()): Promise<ResumoLembretes> {
  const resumo: ResumoLembretes = { candidatas: 0, enviados: 0, falhas: 0 };
  if (!lembreteLigado()) return resumo;
  const hora = horaNaAcademia(agora);
  if (hora < JANELA.de || hora > JANELA.ate) return resumo;

  const hoje = hojeNaAcademia(agora);
  const amanha = somarDias(hoje, 1);
  const aulas = await prisma.aulaExperimental.findMany({
    where: {
      lembreteEnviadoEm: null,
      presenca: null,
      // NOT sozinho descartaria lembreteErro nulo (NULL no SQL) — o caso normal.
      AND: [
        { OR: [{ lembreteErro: null }, { NOT: { lembreteErro: { startsWith: DEFINITIVO } } }] },
        { OR: [{ data: amanha }, { data: hoje, hora: { gt: hora + 1 } }] },
      ],
    },
    orderBy: [{ data: "asc" }, { hora: "asc" }],
  });
  // Marcada hoje para hoje: a confirmação acabou de sair, lembrete seria repetição.
  const fila = aulas.filter((a) => a.data === amanha || hojeNaAcademia(a.criadoEm) < hoje);
  resumo.candidatas = fila.length;
  if (!fila.length) return resumo;

  const cfg = configEvolution();
  const instancia = await prisma.whatsappInstance.findFirst({ orderBy: { criadoEm: "asc" } });
  if (!cfg || !instancia || instancia.status !== "CONNECTED") {
    await prisma.aulaExperimental.updateMany({
      where: { id: { in: fila.map((a) => a.id) } },
      data: { lembreteErro: "WhatsApp da academia desconectado" },
    });
    resumo.falhas = fila.length;
    return resumo;
  }

  for (const aula of fila) {
    const telefone = telefoneComDdi(aula.telefone);
    if (!telefone) {
      await prisma.aulaExperimental.update({ where: { id: aula.id }, data: { lembreteErro: `${DEFINITIVO}telefone inválido` } });
      resumo.falhas++;
      continue;
    }
    const texto = mensagemLembreteAula({ nome: aula.nome, modalidade: aula.modalidade, data: aula.data, hora: aula.hora, hoje });
    try {
      const conversaId = await conversaDaAula({
        instanceId: instancia.id,
        unitId: aula.unitId,
        conversaId: aula.conversaId,
        personId: aula.personId,
        telefone,
      });
      const waId = await enviarTexto(cfg, instancia.evolutionInstance, telefone, texto);
      // Marca antes de gravar a bolha: se a bolha falhar, não manda de novo.
      await prisma.aulaExperimental.update({
        where: { id: aula.id },
        data: { lembreteEnviadoEm: new Date(), lembreteErro: null, conversaId: aula.conversaId ?? conversaId },
      });
      await registrarMensagemRepo({
        conversaId,
        waMessageId: waId ?? `local:${randomUUID()}`,
        direcao: "OUT",
        autor: "ATENDENTE",
        autorUserId: null,
        texto,
      }).catch((e) => console.error("[lembrete aula] enviado, mas a bolha não gravou:", e));
      resumo.enviados++;
    } catch (e) {
      const status = e instanceof EvolutionError ? e.status : 502;
      // 4xx da Evolution = número recusado: repetir não resolve.
      const transitoria = status >= 500 || status === 408 || status === 409 || status === 429;
      const msg = e instanceof Error ? e.message.slice(0, 200) : "falha no envio";
      await prisma.aulaExperimental.update({
        where: { id: aula.id },
        data: { lembreteErro: transitoria ? msg : `${DEFINITIVO}${msg}` },
      });
      resumo.falhas++;
    }
  }
  return resumo;
}
