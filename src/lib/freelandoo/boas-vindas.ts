import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { registrarMensagemRepo } from "@/lib/repositories/whatsapp";
import { chaveTelefone } from "@/lib/whatsapp/telefone";
import { configEvolution, enviarTexto, EvolutionError } from "@/lib/whatsapp/evolution";
import { telefoneComDdi } from "@/lib/freelandoo/elegibilidade";

/**
 * ÚNICA exceção à regra "nada é enviado sozinho" (decisão Q4, 2026-10-20):
 * a mensagem com o link de primeiro acesso da Freelandoo, uma vez por aluno.
 *
 * Este é o único módulo fora de rota com sessão autorizado a importar o envio
 * do WhatsApp — travado por `lib/freelandoo/envio-automatico.test.ts`. Quem
 * dispara (catraca, matrícula) só enfileira; quem chama este módulo é o
 * processador da fila (`fila.ts`), rodando no agendador.
 */

export type ResultadoBoasVindas =
  | { tipo: "enviado"; waMessageId: string }
  | { tipo: "sem_telefone" }
  | { tipo: "nao_configurado" }
  | { tipo: "falha"; erro: string; transitoria: boolean };

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

export function textoBoasVindas(nome: string, link: string): string {
  const quem = primeiroNome(nome);
  return (
    `Olá${quem ? `, ${quem}` : ""}! Seu acesso ao app de treinos da Academia Coliseu está pronto. ` +
    `Toque para criar sua senha: ${link} (vale por 7 dias).`
  );
}

/**
 * Conversa 1:1 do aluno nesta instância. Procura pelo final do número (o
 * WhatsApp pode ter gravado o JID sem o 9º dígito); senão cria, já ligada ao
 * cadastro — a resposta do aluno cai na mesma conversa no Atendimento.
 */
async function conversaDoAluno(input: {
  instanceId: string; unitId: string; personId: string; telefone: string;
}): Promise<string> {
  const chave = chaveTelefone(input.telefone);
  const candidatas = await prisma.conversa.findMany({
    where: { instanceId: input.instanceId, ehGrupo: false, telefone: { endsWith: chave } },
    select: { id: true, personId: true },
    orderBy: { ultimaMensagemEm: "desc" },
  });
  const dele = candidatas.find((c) => c.personId === input.personId) ?? candidatas[0];
  if (dele) return dele.id;

  const remoteJid = `${input.telefone}@s.whatsapp.net`;
  try {
    const nova = await prisma.conversa.create({
      data: {
        unitId: input.unitId, instanceId: input.instanceId, remoteJid,
        telefone: input.telefone, personId: input.personId,
      },
      select: { id: true },
    });
    return nova.id;
  } catch {
    const ja = await prisma.conversa.findUnique({
      where: { instanceId_remoteJid: { instanceId: input.instanceId, remoteJid } },
      select: { id: true },
    });
    if (ja) return ja.id;
    throw new Error("não foi possível abrir a conversa do aluno");
  }
}

/**
 * Manda o link pelo número da academia (Evolution do Coliseu, decisão Q10) e
 * grava a bolha como OUT na conversa do aluno.
 *
 * Telefone ausente/inválido não é falha: a conta existe, a ficha mostra
 * "acesso não enviado" e o botão de reenviar. WhatsApp desconectado é
 * transitório (a fila tenta de novo).
 */
export async function enviarBoasVindas(input: { personId: string; link: string }): Promise<ResultadoBoasVindas> {
  const cfg = configEvolution();
  if (!cfg) return { tipo: "nao_configurado" };

  const pessoa = await prisma.person.findUnique({
    where: { id: input.personId },
    select: { id: true, nome: true, telefone: true, unitId: true },
  });
  if (!pessoa) return { tipo: "falha", erro: "pessoa não encontrada", transitoria: false };
  const telefone = telefoneComDdi(pessoa.telefone);
  if (!telefone) return { tipo: "sem_telefone" };

  const instancia = await prisma.whatsappInstance.findFirst({ orderBy: { criadoEm: "asc" } });
  if (!instancia || instancia.status !== "CONNECTED") {
    return { tipo: "falha", erro: "WhatsApp da academia desconectado", transitoria: true };
  }

  const conversaId = await conversaDoAluno({
    instanceId: instancia.id, unitId: pessoa.unitId, personId: pessoa.id, telefone,
  });
  const texto = textoBoasVindas(pessoa.nome, input.link);

  let waId: string | null;
  try {
    waId = await enviarTexto(cfg, instancia.evolutionInstance, telefone, texto);
  } catch (e) {
    const status = e instanceof EvolutionError ? e.status : 502;
    // 4xx da Evolution = número recusado/mensagem inválida: repetir não resolve.
    const transitoria = status >= 500 || status === 408 || status === 409 || status === 429;
    return { tipo: "falha", erro: e instanceof Error ? e.message.slice(0, 200) : "falha no envio", transitoria };
  }

  // Sem id do WhatsApp não há dedupe do eco do webhook; "local:" deixa explícito.
  const waMessageId = waId ?? `local:${randomUUID()}`;
  // Autor ATENDENTE sem usuário: o enum não tem "sistema"; é o mesmo registro
  // de uma mensagem que saiu pelo aparelho da academia.
  await registrarMensagemRepo({
    conversaId, waMessageId, direcao: "OUT", autor: "ATENDENTE", autorUserId: null, texto,
  }).catch((e) => console.error("[freelandoo] boas-vindas enviada, mas a bolha não gravou:", e));
  return { tipo: "enviado", waMessageId };
}
