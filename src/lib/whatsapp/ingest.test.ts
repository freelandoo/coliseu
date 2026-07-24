import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { unitIdAtual } from "@/lib/repositories/unit";
import { proximoCodigoRepo } from "@/lib/repositories/pessoas";
import {
  classificarConversaRepo,
  limparMensagensRepo,
  listarMensagensRepo,
  removerConversaRepo,
} from "@/lib/repositories/whatsapp";
import { processarEventoWhatsapp } from "@/lib/whatsapp/ingest";

const INSTANCIA = "teste-ingestao";
const JID = "5511999000111@s.whatsapp.net";
const JID_GRUPO = "120363000000000000@g.us";

function evento(overrides: {
  id: string;
  remoteJid?: string;
  texto?: string;
  fromMe?: boolean;
  pushName?: string;
  participant?: string;
}) {
  return {
    event: "messages.upsert",
    instance: INSTANCIA,
    data: {
      key: {
        id: overrides.id,
        remoteJid: overrides.remoteJid ?? JID,
        fromMe: overrides.fromMe ?? false,
        ...(overrides.participant ? { participant: overrides.participant } : {}),
      },
      pushName: overrides.pushName ?? "Cliente Teste",
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: overrides.texto ?? "Oi, quanto custa?" },
    },
  };
}

async function limpar() {
  await prisma.conversa.deleteMany({ where: { instance: { evolutionInstance: INSTANCIA } } });
  await prisma.whatsappInstance.deleteMany({ where: { evolutionInstance: INSTANCIA } });
  await prisma.person.deleteMany({ where: { telefone: { in: ["5511999000111", "5511999000222"] } } });
}

beforeEach(async () => {
  await limpar();
  // A ingestão usa a instância mais antiga; as demais não podem competir.
  await prisma.whatsappInstance.deleteMany({});
  await prisma.whatsappInstance.create({
    data: {
      unitId: await unitIdAtual(),
      evolutionInstance: INSTANCIA,
      nome: "Teste",
      status: "CONNECTED",
    },
  });
});

afterAll(limpar);

test("primeira mensagem cria conversa, lead e histórico", async () => {
  const r = await processarEventoWhatsapp(evento({ id: "MSG-1" }));
  expect(r).toMatchObject({ tipo: "mensagens", gravadas: 1, duplicadas: 0 });

  const conversa = await prisma.conversa.findFirst({
    where: { remoteJid: JID },
    include: { person: true },
  });
  expect(conversa?.telefone).toBe("5511999000111");
  expect(conversa?.naoLidas).toBe(1);
  expect(conversa?.ultimaMensagemPreview).toBe("Oi, quanto custa?");

  // O lead entra no funil da Captação no mesmo instante.
  expect(conversa?.person).toMatchObject({
    nome: "Cliente Teste",
    origem: "whatsapp",
    fase: "lead",
    estagio: "novo",
  });

  const mensagens = await listarMensagensRepo(conversa!.id);
  expect(mensagens).toHaveLength(1);
  expect(mensagens[0]).toMatchObject({ direcao: "IN", autor: "LEAD", texto: "Oi, quanto custa?" });
});

test("reentrega do mesmo waMessageId não duplica", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-2" }));
  const r = await processarEventoWhatsapp(evento({ id: "MSG-2" }));

  expect(r).toMatchObject({ gravadas: 0, duplicadas: 1 });
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  expect(await prisma.mensagem.count({ where: { conversaId: conversa!.id } })).toBe(1);
  expect(conversa?.naoLidas).toBe(1);
});

test("número já cadastrado é vinculado, não duplicado", async () => {
  const existente = await prisma.person.create({
    data: {
      codigo: await proximoCodigoRepo(),
      nome: "Aluno Antigo",
      // Cadastro formatado e sem DDI: o casamento é pelos últimos 8 dígitos.
      telefone: "(11) 99900-0111",
      origem: "balcao",
      fase: "aluno",
      unitId: await unitIdAtual(),
    },
  });

  await processarEventoWhatsapp(evento({ id: "MSG-3" }));

  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  expect(conversa?.personId).toBe(existente.id);
  expect(await prisma.person.count({ where: { nome: "Cliente Teste" } })).toBe(0);

  await prisma.conversa.deleteMany({ where: { personId: existente.id } });
  await prisma.person.delete({ where: { id: existente.id } });
});

test("mensagem enviada pelo aparelho entra como saída sem autor de sistema", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-4" }));
  await processarEventoWhatsapp(evento({ id: "MSG-5", fromMe: true, texto: "Bom dia! Custa 99." }));

  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  const mensagens = await listarMensagensRepo(conversa!.id);
  expect(mensagens.at(-1)).toMatchObject({ direcao: "OUT", autor: "ATENDENTE", autorNome: null });
  // Responder zera o contador de não lidas.
  expect(conversa?.naoLidas).toBe(0);
});

test("grupo vira conversa para atender, mas não vira lead", async () => {
  const r = await processarEventoWhatsapp(
    evento({
      id: "MSG-6",
      remoteJid: JID_GRUPO,
      pushName: "Vitor do Grupo",
      participant: "5511999000222@s.whatsapp.net",
      texto: "Qual o horário de sábado?",
    }),
  );
  expect(r).toMatchObject({ tipo: "mensagens", gravadas: 1 });

  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID_GRUPO } });
  // Sem cadastro e sem telefone: o "120363…" do JID é id de grupo, não número.
  expect(conversa).toMatchObject({ ehGrupo: true, telefone: "", personId: null });
  // O nome de quem escreveu não pode virar título do grupo.
  expect(conversa?.pushName).toBeNull();
  expect(await prisma.person.count({ where: { nome: "Vitor do Grupo" } })).toBe(0);

  // Em grupo, a bolha precisa dizer quem falou.
  const mensagens = await listarMensagensRepo(conversa!.id);
  expect(mensagens.at(-1)).toMatchObject({ remetente: "Vitor do Grupo", texto: "Qual o horário de sábado?" });
});

test("transmissão e status continuam fora do atendimento", async () => {
  const r = await processarEventoWhatsapp(evento({ id: "MSG-6b", remoteJid: "status@broadcast" }));
  expect(r).toMatchObject({ gravadas: 0, duplicadas: 0 });
  expect(await prisma.conversa.count({ where: { remoteJid: "status@broadcast" } })).toBe(0);
});

test("evento sem instância registrada é ignorado sem quebrar", async () => {
  await prisma.conversa.deleteMany({ where: { instance: { evolutionInstance: INSTANCIA } } });
  await prisma.whatsappInstance.deleteMany({});
  const r = await processarEventoWhatsapp(evento({ id: "MSG-7" }));
  expect(r.tipo).toBe("ignorado");
});

test("classificar registra o atendimento e move o lead no funil", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-8" }));
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });

  const user = await prisma.user.findFirst();
  expect(user, "o banco de teste precisa de um usuário semeado").toBeTruthy();

  const atualizada = await classificarConversaRepo({
    conversaId: conversa!.id,
    userId: user!.id,
    interesse: "com_interesse",
    observacao: "Quer visitar sábado",
  });

  expect(atualizada?.interesse).toBe("com_interesse");
  const pessoa = await prisma.person.findUnique({ where: { id: conversa!.personId! } });
  expect(pessoa?.estagio).toBe("interesse");

  const registros = await prisma.atendimentoRegistro.findMany({
    where: { conversaId: conversa!.id },
  });
  expect(registros).toHaveLength(1);
  expect(registros[0]).toMatchObject({ userId: user!.id, observacao: "Quer visitar sábado" });
});

test("limpar apaga as mensagens e preserva conversa, lead e atendimentos", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-10" }));
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  const user = await prisma.user.findFirst();
  await classificarConversaRepo({
    conversaId: conversa!.id,
    userId: user!.id,
    interesse: "com_interesse",
  });

  const apagadas = await limparMensagensRepo(conversa!.id);

  expect(apagadas).toBe(1);
  expect(await prisma.mensagem.count({ where: { conversaId: conversa!.id } })).toBe(0);
  const depois = await prisma.conversa.findUnique({ where: { id: conversa!.id } });
  expect(depois).toMatchObject({ ultimaMensagemPreview: "", naoLidas: 0, interesse: "com_interesse" });
  expect(depois?.personId).toBe(conversa!.personId);
  expect(await prisma.atendimentoRegistro.count({ where: { conversaId: conversa!.id } })).toBe(1);
});

test("remover apaga conversa e mensagens, mas nunca o cadastro do lead", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-11" }));
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  const personId = conversa!.personId!;

  expect(await removerConversaRepo(conversa!.id)).toBe(true);

  expect(await prisma.conversa.count({ where: { id: conversa!.id } })).toBe(0);
  expect(await prisma.mensagem.count({ where: { conversaId: conversa!.id } })).toBe(0);
  // O lead é cadastro do CRM: sobrevive à remoção da conversa.
  expect(await prisma.person.count({ where: { id: personId } })).toBe(1);
});

test("remover conversa inexistente devolve false em vez de estourar", async () => {
  expect(await removerConversaRepo("nao-existe")).toBe(false);
});

test("connection.update 'connecting' nao derruba uma instancia conectada", async () => {
  const base = { event: "connection.update", instance: INSTANCIA };
  await processarEventoWhatsapp({ ...base, data: { state: "open", wuid: "5511999000111@s.whatsapp.net" } });
  expect((await prisma.whatsappInstance.findFirst())?.status).toBe("CONNECTED");

  // Handshake/reconexão: estado de passagem, não queda.
  await processarEventoWhatsapp({ ...base, data: { state: "connecting" } });
  expect((await prisma.whatsappInstance.findFirst())?.status).toBe("CONNECTED");

  // 'close' e queda de verdade.
  await processarEventoWhatsapp({ ...base, data: { state: "close" } });
  expect((await prisma.whatsappInstance.findFirst())?.status).toBe("DISCONNECTED");
});

test("reclassificar move o lead no funil nos dois sentidos", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-12" }));
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  const user = await prisma.user.findFirst();
  const estagioDoLead = async () =>
    (await prisma.person.findUnique({ where: { id: conversa!.personId! } }))?.estagio;

  const classificar = (interesse: Parameters<typeof classificarConversaRepo>[0]["interesse"]) =>
    classificarConversaRepo({ conversaId: conversa!.id, userId: user!.id, interesse });

  await classificar("com_interesse");
  expect(await estagioDoLead()).toBe("interesse");

  // A recepção volta atrás: o funil precisa acompanhar, nao ficar preso.
  await classificar("nao_classificado");
  expect(await estagioDoLead()).toBe("novo");

  await classificar("sem_interesse");
  expect(await estagioDoLead()).toBe("qualificado");

  await classificar("convertido");
  expect(await estagioDoLead()).toBe("convertido");
});

test("sair de perdido limpa o motivo", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-13" }));
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  const user = await prisma.user.findFirst();

  await classificarConversaRepo({
    conversaId: conversa!.id,
    userId: user!.id,
    interesse: "perdido",
    motivoPerdido: "Achou caro",
  });
  await classificarConversaRepo({
    conversaId: conversa!.id,
    userId: user!.id,
    interesse: "com_interesse",
  });

  const pessoa = await prisma.person.findUnique({ where: { id: conversa!.personId! } });
  expect(pessoa).toMatchObject({ estagio: "interesse", motivoPerdido: null });
});

test("perdido guarda o motivo no cadastro", async () => {
  await processarEventoWhatsapp(evento({ id: "MSG-9" }));
  const conversa = await prisma.conversa.findFirst({ where: { remoteJid: JID } });
  const user = await prisma.user.findFirst();

  await classificarConversaRepo({
    conversaId: conversa!.id,
    userId: user!.id,
    interesse: "perdido",
    motivoPerdido: "Achou caro",
  });

  const pessoa = await prisma.person.findUnique({ where: { id: conversa!.personId! } });
  expect(pessoa).toMatchObject({ estagio: "perdido", motivoPerdido: "Achou caro" });
});
