import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { limparMensagensRepo, removerConversaRepo } from "@/lib/repositories/whatsapp";
import {
  BackupErro,
  listarBackupsRepo,
  obterMensagensBackupRepo,
  restaurarBackupRepo,
} from "@/lib/repositories/whatsapp-backup";

/**
 * Integração: a lixeira só faz sentido contra o banco de verdade (transação,
 * cascade e o unique de waMessageId são metade da regra).
 */

const PREFIXO = "teste-backup";
const ATOR = { id: "", nome: "Fulano da Recepção" };

async function limpar() {
  const backups = await prisma.conversaBackup.findMany({
    where: { remoteJid: { startsWith: PREFIXO } },
    select: { id: true },
  });
  await prisma.conversaBackup.deleteMany({ where: { id: { in: backups.map((b) => b.id) } } });
  await prisma.conversa.deleteMany({ where: { remoteJid: { startsWith: PREFIXO } } });
  await prisma.whatsappInstance.deleteMany({
    where: { evolutionInstance: { startsWith: PREFIXO } },
  });
}

beforeEach(limpar);
afterAll(limpar);

async function unidade() {
  const u = await prisma.unit.findFirst({ orderBy: { createdAt: "asc" } });
  if (!u) throw new Error("banco sem unidade — rode o seed antes dos testes");
  return u.id;
}

let seq = 0;

/** Conversa com histórico, pronta para ser apagada. */
async function conversaComMensagens(quantas = 3) {
  const unitId = await unidade();
  const marca = `${PREFIXO}-${Date.now()}-${seq++}`;
  const instance = await prisma.whatsappInstance.create({
    data: { unitId, evolutionInstance: marca, nome: "Instância de teste" },
  });
  const conversa = await prisma.conversa.create({
    data: {
      unitId,
      instanceId: instance.id,
      remoteJid: `${marca}@s.whatsapp.net`,
      telefone: "11987650000",
      pushName: "Cliente Teste",
      ultimaMensagemPreview: `msg ${quantas}`,
    },
  });
  for (let i = 1; i <= quantas; i++) {
    await prisma.mensagem.create({
      data: {
        conversaId: conversa.id,
        waMessageId: `${marca}-wa-${i}`,
        direcao: i % 2 ? "IN" : "OUT",
        autor: i % 2 ? "LEAD" : "ATENDENTE",
        texto: `msg ${i}`,
        enviadaEm: new Date(Date.now() - (quantas - i) * 60_000),
      },
    });
  }
  return { conversa, instance, marca };
}

async function backupDa(conversaId: string) {
  const b = await prisma.conversaBackup.findFirst({
    where: { conversaId },
    orderBy: { excluidoEm: "desc" },
  });
  if (!b) throw new Error("nenhum backup gravado para a conversa");
  return b;
}

describe("limpar", () => {
  test("copia o histórico para a lixeira antes de apagar", async () => {
    const { conversa } = await conversaComMensagens(3);

    const apagadas = await limparMensagensRepo(conversa.id, ATOR);

    expect(apagadas).toBe(3);
    expect(await prisma.mensagem.count({ where: { conversaId: conversa.id } })).toBe(0);
    // A conversa continua na lista — "limpar" só leva as mensagens.
    expect(await prisma.conversa.count({ where: { id: conversa.id } })).toBe(1);

    const backup = await backupDa(conversa.id);
    expect(backup.motivo).toBe("limpar");
    expect(backup.excluidoPorNome).toBe(ATOR.nome);
    expect(await obterMensagensBackupRepo(backup.id)).toHaveLength(3);
  });

  test("conversa sem mensagem não gera backup vazio", async () => {
    const { conversa } = await conversaComMensagens(0);

    await limparMensagensRepo(conversa.id, ATOR);

    expect(await prisma.conversaBackup.count({ where: { conversaId: conversa.id } })).toBe(0);
  });
});

describe("remover", () => {
  test("guarda conversa e histórico, e some do atendimento", async () => {
    const { conversa } = await conversaComMensagens(2);

    expect(await removerConversaRepo(conversa.id, ATOR)).toBe(true);
    expect(await prisma.conversa.count({ where: { id: conversa.id } })).toBe(0);

    const backup = await backupDa(conversa.id);
    expect(backup.motivo).toBe("remover");
    expect(backup.pushName).toBe("Cliente Teste");
    expect(await obterMensagensBackupRepo(backup.id)).toHaveLength(2);
  });

  test("conversa inexistente não vira backup nem erro", async () => {
    expect(await removerConversaRepo("nao-existe", ATOR)).toBe(false);
  });
});

describe("restaurar", () => {
  test("recria a conversa removida com o histórico", async () => {
    const { conversa } = await conversaComMensagens(3);
    await removerConversaRepo(conversa.id, ATOR);
    const backup = await backupDa(conversa.id);

    const r = await restaurarBackupRepo(backup.id);

    expect(r.conversaId).toBe(conversa.id); // volta com o id de origem
    expect(r.mensagens).toBe(3);
    expect(r.ignoradas).toBe(0);

    const voltou = await prisma.conversa.findUnique({ where: { id: conversa.id } });
    expect(voltou?.remoteJid).toBe(conversa.remoteJid);
    expect(await prisma.mensagem.count({ where: { conversaId: conversa.id } })).toBe(3);
    // O cabeçalho da lista acompanha a última mensagem que voltou.
    expect(voltou?.ultimaMensagemPreview).toBe("msg 3");
  });

  test("devolve as mensagens à conversa que ficou depois do limpar", async () => {
    const { conversa } = await conversaComMensagens(2);
    await limparMensagensRepo(conversa.id, ATOR);
    const backup = await backupDa(conversa.id);

    const r = await restaurarBackupRepo(backup.id);

    expect(r.conversaId).toBe(conversa.id);
    expect(await prisma.mensagem.count({ where: { conversaId: conversa.id } })).toBe(2);
  });

  test("restaurar duas vezes é recusado", async () => {
    const { conversa } = await conversaComMensagens(1);
    await removerConversaRepo(conversa.id, ATOR);
    const backup = await backupDa(conversa.id);

    await restaurarBackupRepo(backup.id);
    await expect(restaurarBackupRepo(backup.id)).rejects.toBeInstanceOf(BackupErro);
  });

  test("mensagem que já está no atendimento não duplica", async () => {
    const { conversa, marca } = await conversaComMensagens(2);
    await removerConversaRepo(conversa.id, ATOR);
    const backup = await backupDa(conversa.id);

    // A pessoa escreveu de novo: nasce outra conversa no mesmo número, e uma
    // das mensagens antigas foi reentregue pelo webhook.
    const nova = await prisma.conversa.create({
      data: {
        unitId: backup.unitId,
        instanceId: backup.instanceId,
        remoteJid: backup.remoteJid,
        telefone: backup.telefone,
      },
    });
    await prisma.mensagem.create({
      data: {
        conversaId: nova.id,
        waMessageId: `${marca}-wa-1`,
        direcao: "IN",
        autor: "LEAD",
        texto: "msg 1",
      },
    });

    const r = await restaurarBackupRepo(backup.id);

    // O histórico entra na conversa viva, sem repetir o que já estava lá.
    expect(r.conversaId).toBe(nova.id);
    expect(r.mensagens).toBe(1);
    expect(r.ignoradas).toBe(1);
    expect(await prisma.mensagem.count({ where: { conversaId: nova.id } })).toBe(2);
  });

  test("backup inexistente devolve 404", async () => {
    await expect(restaurarBackupRepo("nao-existe")).rejects.toMatchObject({ status: 404 });
  });
});

describe("listagem", () => {
  test("filtra pelo dia da exclusão", async () => {
    const { conversa } = await conversaComMensagens(1);
    await removerConversaRepo(conversa.id, ATOR);
    const backup = await backupDa(conversa.id);

    // Empurra a exclusão para dez dias atrás para o filtro ter o que recortar.
    const antes = new Date();
    antes.setDate(antes.getDate() - 10);
    await prisma.conversaBackup.update({
      where: { id: backup.id },
      data: { excluidoEm: antes },
    });

    const dia = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hoje = new Date();

    const noDia = await listarBackupsRepo({ de: dia(antes), ate: dia(antes) });
    expect(noDia.map((b) => b.id)).toContain(backup.id);

    const soHoje = await listarBackupsRepo({ de: dia(hoje), ate: dia(hoje) });
    expect(soHoje.map((b) => b.id)).not.toContain(backup.id);
  });

  test("resume o que a tela precisa mostrar", async () => {
    const { conversa } = await conversaComMensagens(2);
    await removerConversaRepo(conversa.id, ATOR);

    const item = (await listarBackupsRepo()).find((b) => b.conversaId === conversa.id);

    expect(item).toMatchObject({
      nome: "Cliente Teste",
      motivo: "remover",
      excluidoPor: ATOR.nome,
      mensagens: 2,
      restauradoEm: null,
    });
  });
});
