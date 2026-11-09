/**
 * Conferência do atendimento com a Evolution.
 *
 * A Evolution grava tudo o que recebe no schema `evolution` do mesmo Postgres
 * do Coliseu. Isso é a nossa caixa de entrada durável: em vez de confiar só no
 * webhook (que já ficou semanas quebrado sem ninguém ver), o agendador compara
 * as duas pontas e corrige o que faltar.
 *
 * - `conferirMensagens`: importa o que a Evolution tem e o Coliseu não —
 *   pelo mesmo caminho do webhook (`ingerirMensagens`).
 * - `sincronizarLeituras`: o que a equipe leu no celular/WhatsApp Web chega à
 *   Evolution como confirmação de leitura; o contador de não lidas acompanha.
 * - `verificarRecebimento`: Evolution conectada, equipe enviando, e nada
 *   chegando há horas em horário de atendimento = sessão quebrada. Avisa os
 *   admins (sininho + push) uma vez por incidente.
 *
 * INVARIANTE: não importa `@/lib/whatsapp/evolution` (o envio). Conferir não
 * responde ninguém.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notificarAdmins } from "@/lib/notificacoes";
import { instanciaAtualRepo } from "@/lib/repositories/whatsapp";
import { publicarMensagem } from "@/lib/whatsapp/eventos";
import { ingerirMensagens, type OpcoesIngestao, type ResultadoLote } from "@/lib/whatsapp/ingest";

/** O schema da Evolution só existe onde ela grava (produção). Em dev/teste, nada a fazer. */
export async function evolutionNoBanco(): Promise<boolean> {
  const r = await prisma.$queryRaw<{ ok: boolean }[]>`
    select to_regclass('evolution."Message"') is not null
       and to_regclass('evolution."MessageUpdate"') is not null
       and to_regclass('evolution."Instance"') is not null as ok`;
  return !!r[0]?.ok;
}

interface LinhaEvolution {
  key: Record<string, unknown>;
  message: Record<string, unknown> | null;
  pushName: string | null;
  messageTimestamp: number;
}

/** A linha da tabela da Evolution no formato do item do `messages.upsert`. */
export function itemDaLinha(l: LinhaEvolution): Record<string, unknown> {
  return {
    key: l.key,
    pushName: l.pushName ?? "",
    messageTimestamp: Number(l.messageTimestamp),
    message: l.message,
  };
}

/**
 * Mensagens da Evolution, num intervalo, que o Coliseu não tem — nem na
 * conversa nem na lixeira (o que a equipe apagou de propósito não volta).
 */
export async function mensagensFaltando(
  evolutionInstance: string,
  desde: Date,
  ate: Date,
  limite = 500,
): Promise<LinhaEvolution[]> {
  const de = Math.floor(desde.getTime() / 1000);
  const a = Math.floor(ate.getTime() / 1000);
  return prisma.$queryRaw<LinhaEvolution[]>(Prisma.sql`
    select e.key, e.message, e."pushName", e."messageTimestamp"
      from evolution."Message" e
      join evolution."Instance" i on i.id = e."instanceId" and i.name = ${evolutionInstance}
     where e."messageTimestamp" >= ${de} and e."messageTimestamp" < ${a}
       and not exists (select 1 from "Mensagem" m where m."waMessageId" = e.key->>'id')
       and not exists (select 1 from "MensagemBackup" b where b."waMessageId" = e.key->>'id')
     order by e."messageTimestamp"
     limit ${limite}`);
}

export interface ResultadoConferencia extends ResultadoLote {
  encontradas: number;
}

/** Importa o que faltou no intervalo. Mensagem nova conta como não lida; histórico, não. */
export async function conferirMensagens(
  desde: Date,
  ate: Date,
  opcoes: OpcoesIngestao & { mapearJid?: (jid: string) => string | undefined } = {},
): Promise<ResultadoConferencia> {
  const vazio = { encontradas: 0, gravadas: 0, duplicadas: 0, puladas: 0 };
  const instancia = await instanciaAtualRepo();
  if (!instancia) return vazio;

  const total = { ...vazio };
  // Em lotes: a importação de histórico pode trazer milhares de uma vez.
  let cursor = desde;
  for (;;) {
    const linhas = await mensagensFaltando(instancia.evolutionInstance, cursor, ate);
    if (linhas.length === 0) break;
    const itens = linhas.map((l) => {
      const item = itemDaLinha(l);
      const key = { ...(item.key as Record<string, unknown>) };
      // Mensagem antiga (antes da Evolution mandar o telefone junto) só tem o
      // @lid: o mapa traz o telefone visto em mensagens posteriores do mesmo contato.
      if (opcoes.mapearJid && !key.remoteJidAlt && typeof key.remoteJid === "string") {
        const alt = opcoes.mapearJid(key.remoteJid);
        if (alt) key.remoteJidAlt = alt;
      }
      return { ...item, key };
    });
    const r = await ingerirMensagens(itens, instancia.id, opcoes);
    total.encontradas += linhas.length;
    total.gravadas += r.gravadas;
    total.duplicadas += r.duplicadas;
    total.puladas += r.puladas;
    if (linhas.length < 500) break;
    // Puladas continuam "faltando" na próxima consulta: avança o cursor para
    // não girar em falso. Se o lote inteiro caiu no mesmo segundo, pula o segundo.
    const ultimo = new Date(Number(linhas[linhas.length - 1].messageTimestamp) * 1000);
    cursor = ultimo > cursor ? ultimo : new Date(cursor.getTime() + 1000);
    if (cursor >= ate) break;
  }
  return total;
}

/**
 * Leitura feita fora do Coliseu (celular, WhatsApp Web): a Evolution guarda a
 * confirmação de leitura das mensagens recebidas. Para cada conversa com não
 * lidas, o contador passa a ser o número de recebidas **depois** da última que
 * foi lida lá. Só abaixa — nunca aumenta o que o Coliseu contou.
 */
export async function sincronizarLeituras(): Promise<number> {
  const alteradas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    with lida as (
      select m."conversaId" id, max(m."enviadaEm") ult
        from "Mensagem" m
        join "Conversa" c on c.id = m."conversaId" and c."naoLidas" > 0
       where m.direcao = 'IN'
         and exists (select 1 from evolution."MessageUpdate" u
                      where u."keyId" = m."waMessageId" and u."fromMe" = false
                        and u.status in ('READ', 'PLAYED'))
       group by 1
    ), novo as (
      select l.id, (select count(*)::int from "Mensagem" m
                     where m."conversaId" = l.id and m.direcao = 'IN' and m."enviadaEm" > l.ult) n
        from lida l
    )
    update "Conversa" c set "naoLidas" = novo.n
      from novo
     where c.id = novo.id and novo.n < c."naoLidas"
    returning c.id`);
  for (const { id } of alteradas) publicarMensagem({ conversaId: id, direcao: "OUT" });
  return alteradas.length;
}

/** Horário de atendimento em São Paulo: segunda a sábado, 8h às 21h. */
export function emHorarioDeAtendimento(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  return dia !== "Sun" && hora >= 8 && hora < 21;
}

const JANELA_SILENCIO_MS = 3 * 60 * 60 * 1000;
const ENVIOS_MINIMOS = 3;

/**
 * O sintoma de 09/11/2026: a sessão da Evolution seguiu "conectada" e
 * enviando, mas parou de receber — o celular recebia normalmente. Nada no
 * Coliseu acusava. Regra: conectada, pelo menos 3 envios nas últimas 3 horas,
 * nenhuma mensagem recebida nesse tempo, em horário de atendimento.
 */
export async function verificarRecebimento(agora = new Date()): Promise<"ok" | "avisado" | "fora"> {
  if (!emHorarioDeAtendimento(agora)) return "fora";
  const instancia = await instanciaAtualRepo();
  if (!instancia) return "fora";

  const desde = Math.floor((agora.getTime() - JANELA_SILENCIO_MS) / 1000);
  const [r] = await prisma.$queryRaw<{ aberta: boolean; ultimo_in: number | null; envios: number }[]>(Prisma.sql`
    select coalesce(i."connectionStatus" = 'open', false) aberta,
           (select max(e."messageTimestamp") from evolution."Message" e
             where e."instanceId" = i.id and (e.key->>'fromMe') = 'false') ultimo_in,
           (select count(*)::int from evolution."Message" e
             where e."instanceId" = i.id and (e.key->>'fromMe') = 'true'
               and e."messageTimestamp" >= ${desde}) envios
      from evolution."Instance" i
     where i.name = ${instancia.evolutionInstance}`);
  if (!r || !r.aberta || r.envios < ENVIOS_MINIMOS) return "ok";
  const ultimoIn = r.ultimo_in == null ? null : Number(r.ultimo_in);
  if (ultimoIn != null && ultimoIn >= desde) return "ok";

  const desdeQuando = ultimoIn
    ? new Date(ultimoIn * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "sempre";
  await notificarAdmins({
    tipo: "whatsapp_sem_receber",
    titulo: "WhatsApp não está recebendo mensagens",
    corpo:
      `Nenhuma mensagem chegou ao Coliseu desde ${desdeQuando}, mas o número continua enviando. ` +
      "Desconecte e conecte de novo em Atendimento (novo QR Code).",
    url: "/atendimento",
    // Um aviso por incidente: o incidente é "parou depois da mensagem X".
    chave: `whatsapp-sem-receber:${ultimoIn ?? instancia.id}`,
  });
  return "avisado";
}

/** Rodada do agendador: últimas 24h (menos os 2 min em que o webhook ainda pode chegar). */
export async function rodarConferenciaWhatsapp(agora = new Date()) {
  if (!(await evolutionNoBanco())) return null;
  const mensagens = await conferirMensagens(
    new Date(agora.getTime() - 24 * 60 * 60 * 1000),
    new Date(agora.getTime() - 2 * 60 * 1000),
  );
  const leituras = await sincronizarLeituras();
  const recebimento = await verificarRecebimento(agora);
  return { mensagens, leituras, recebimento };
}
