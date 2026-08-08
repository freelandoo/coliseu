/**
 * Indicadores de uso do atendimento — a parte que não tem banco nem pixel.
 *
 * Duas perguntas diferentes moram aqui, e elas medem coisas diferentes:
 *
 * - **Tempo em tela** é medido. O navegador de quem está logado bate um ponto
 *   enquanto a aba está visível e houve mão no teclado há pouco; cada batida
 *   marca o bloco de cinco minutos em que caiu (ver `PresencaSlot`). Somar os
 *   blocos distintos dá o tempo real com o sistema aberto, sem contar a aba
 *   esquecida aberta na recepção durante a noite.
 * - **Tempo ativo** é estimado, e vale para trás. Sai das marcas de hora das
 *   ações que já ficavam gravadas (mensagem enviada, lead classificado, aula
 *   marcada, matrícula feita): ações próximas viram um bloco de trabalho, e um
 *   intervalo grande demais entre duas quebra o bloco. É o que responde "quanto
 *   tempo essa pessoa trabalhou" no histórico anterior à medição.
 *
 * As duas convivem de propósito: a medida diz quanto tempo o sistema esteve na
 * frente da pessoa, a estimativa diz quanto tempo a pessoa esteve na frente do
 * trabalho. Uma sem a outra mente — a primeira conta quem deixa a tela aberta
 * sem atender, a segunda não enxerga quem passou a manhã lendo conversa.
 */

import { FUSO_ACADEMIA, dataISO, hojeNaAcademia } from "@/lib/aula-experimental";

const MINUTO_MS = 60_000;
const DIA_MS = 86_400_000;

/**
 * Tamanho do bloco de presença. Cinco minutos é o meio-termo: a batida de ponto
 * do navegador vem a cada minuto, então nenhum bloco de trabalho escapa, e uma
 * jornada de oito horas cabe em ~96 linhas por pessoa por dia — barato de
 * guardar e de somar. O preço é a granularidade: quem entra só para ver uma
 * conversa aparece com cinco minutos.
 */
export const SLOT_MS = 5 * MINUTO_MS;

/** De quanto em quanto tempo o navegador bate o ponto (ver `PresencaHeartbeat`). */
export const BATIMENTO_MS = MINUTO_MS;

/**
 * Silêncio que apaga o "online agora". Duas batidas perdidas: menos que isso e
 * uma troca de página faria a bolinha piscar; mais e ela ficaria acesa depois
 * de a pessoa ter ido embora.
 */
export const ONLINE_MS = 2 * BATIMENTO_MS + SLOT_MS;

/**
 * Tempo sem mexer no aparelho que interrompe a contagem de presença. Alinhado
 * ao bloco: quem ficou cinco minutos parado deixa de marcar o bloco seguinte.
 */
export const OCIOSO_MS = SLOT_MS;

/**
 * Buraco entre duas ações que fecha um bloco de trabalho na estimativa. Meia
 * hora é o intervalo em que a recepção ainda está no mesmo assunto (uma
 * conversa que espera resposta do lead, um atendimento no balcão); acima disso
 * é outro turno, e emendar os dois inventaria trabalho que não houve.
 */
export const GAP_ATIVIDADE_MS = 30 * MINUTO_MS;

/**
 * O que uma ação isolada vale. Sem essa cauda, quem mandou uma única mensagem
 * marcaria zero — e um bloco de dez mensagens seguidas terminaria no instante
 * da última, como se ela não tivesse custado nada.
 */
export const CAUDA_ATIVIDADE_MS = SLOT_MS;

/** Início do bloco de cinco minutos em que o instante caiu. */
export function inicioDoSlot(instante: number | Date): Date {
  const t = instante instanceof Date ? instante.getTime() : instante;
  return new Date(Math.floor(t / SLOT_MS) * SLOT_MS);
}

/**
 * Soma dos blocos de trabalho, em milissegundos. As marcas de hora vêm de
 * qualquer ação registrada; a ordem não importa (ordena aqui) e repetição no
 * mesmo instante não conta duas vezes.
 */
export function estimarTempoAtivo(
  instantes: number[],
  { gapMs = GAP_ATIVIDADE_MS, caudaMs = CAUDA_ATIVIDADE_MS } = {},
): number {
  if (instantes.length === 0) return 0;

  const ordenados = [...instantes].sort((a, b) => a - b);
  let total = 0;
  let inicio = ordenados[0];
  let anterior = ordenados[0];

  for (let i = 1; i < ordenados.length; i++) {
    const t = ordenados[i];
    if (t - anterior > gapMs) {
      total += anterior - inicio + caudaMs;
      inicio = t;
    }
    anterior = t;
  }

  return total + (anterior - inicio) + caudaMs;
}

/**
 * Duração como a recepção fala: "2h 15min", "40min", "—" quando não houve nada.
 * Arredonda para minuto cheio; hora redonda sai sem os minutos.
 */
export function formatarDuracao(ms: number): string {
  const minutos = Math.round(ms / MINUTO_MS);
  if (minutos <= 0) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto}min`;
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
}

/** "há 3min", "há 2h", "ontem" — idade da última atividade, em uma palavra. */
export function comoFalarDoInstante(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return "—";
  const ms = agora.getTime() - new Date(iso).getTime();
  if (ms < 2 * MINUTO_MS) return "agora";
  if (ms < 60 * MINUTO_MS) return `há ${Math.round(ms / MINUTO_MS)}min`;
  if (ms < DIA_MS) return `há ${Math.floor(ms / (60 * MINUTO_MS))}h`;
  const dias = Math.floor(ms / DIA_MS);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

/* ---------- período da consulta ---------- */

export const PERIODOS = ["hoje", "7d", "30d", "mes"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Este mês",
};

export function ehPeriodo(v: unknown): v is Periodo {
  return typeof v === "string" && (PERIODOS as readonly string[]).includes(v);
}

/**
 * Deslocamento do fuso da academia num instante, em milissegundos (São Paulo
 * hoje: -3h). Sai do `Intl` em vez de constante porque o horário de verão pode
 * voltar — e no dia em que voltar a conta acompanha sozinha.
 */
function deslocamentoFuso(d: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_ACADEMIA,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const comoSeFosseUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return comoSeFosseUtc - d.getTime();
}

/**
 * Instante em que "AAAA-MM-DD" começa no relógio da academia. Duas passadas
 * porque o deslocamento é medido num instante e o instante depende dele: a
 * primeira chuta, a segunda acerta — só importa na madrugada da virada do
 * horário de verão, mas é lá que a conta de um dia inteiro erraria.
 */
export function inicioDoDia(data: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const meiaNoiteUtc = Date.UTC(ano, mes - 1, dia);
  let t = meiaNoiteUtc - deslocamentoFuso(new Date(meiaNoiteUtc));
  t = meiaNoiteUtc - deslocamentoFuso(new Date(t));
  return new Date(t);
}

/** "AAAA-MM-DD" somado de dias — conta em UTC, como o resto do calendário. */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const t = new Date(Date.UTC(ano, mes - 1, dia) + dias * DIA_MS);
  return dataISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * A janela que o período recorta. Sempre termina agora — o indicador é do que
 * já aconteceu, e um fim no futuro só encheria a tela de tempo que não passou.
 * O começo é meia-noite no relógio da academia: "hoje" tem de ser o dia da
 * recepção, não o dia de UTC (às 21h de sábado eles discordam).
 */
export function intervaloPeriodo(
  periodo: Periodo,
  agora: Date = new Date(),
): { inicio: Date; fim: Date } {
  const hoje = hojeNaAcademia(agora);
  const primeiroDia =
    periodo === "hoje"
      ? hoje
      : periodo === "7d"
        ? somarDias(hoje, -6)
        : periodo === "30d"
          ? somarDias(hoje, -29)
          : `${hoje.slice(0, 7)}-01`;
  return { inicio: inicioDoDia(primeiroDia), fim: agora };
}
