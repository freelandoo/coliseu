/**
 * Aula experimental: a visita marcada com quem ainda não é aluno.
 *
 * Data e hora andam como "AAAA-MM-DD" + hora cheia, no relógio da academia.
 * `Date` aqui só traria problema: o servidor roda em UTC e o celular da
 * recepção em São Paulo, então às 21h de um sábado os dois discordam sobre que
 * dia é hoje — e a pergunta que a recepção faz ("quem tem aula hoje?") viraria
 * aula no dia errado. Com data em texto, é comparação de string.
 */

/** As modalidades que a academia abre para experimentar. */
export const MODALIDADES = [
  "Musculação",
  "Muay Thai",
  "Boxe",
  "Taekwondo",
  "Jiu Jitsu",
] as const;

export type Modalidade = (typeof MODALIDADES)[number];

export const HORA_MIN = 6;
export const HORA_MAX = 22;

/** Horas cheias em que dá para marcar — 6h às 22h. */
export const HORAS: number[] = Array.from(
  { length: HORA_MAX - HORA_MIN + 1 },
  (_, i) => HORA_MIN + i,
);

export function ehModalidade(v: unknown): v is Modalidade {
  return typeof v === "string" && (MODALIDADES as readonly string[]).includes(v);
}

export function ehHora(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= HORA_MIN && v <= HORA_MAX;
}

/** Monta "AAAA-MM-DD" a partir dos números do calendário (mês de 1 a 12). */
export function dataISO(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Aceita só data existente: o formato certo não basta, "2026-02-31" tem que
 * cair fora. Confere reconstruindo o dia no calendário.
 */
export function ehDataISO(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [ano, mes, dia] = v.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  // Dia 0 do mês seguinte é o último dia deste mês.
  return dia <= new Date(ano, mes, 0).getDate();
}

/** A academia é em São Paulo — é esse o relógio que decide que dia é hoje. */
export const FUSO_ACADEMIA = "America/Sao_Paulo";

/**
 * Hoje no relógio da academia. Fixar o fuso (em vez de usar o do aparelho)
 * mantém servidor e tela dando a mesma resposta: sem isso, o Next renderiza a
 * lista com o "hoje" de UTC e o navegador re-renderiza com outro, e às 21h de
 * sábado a aula de hoje apareceria como a de ontem.
 */
export function hojeNaAcademia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_ACADEMIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** "2026-08-04" → "04/08" — como a recepção fala a data. */
export function formatarDiaMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

/** "2026-08-04" → "04/08/2026", para a lista da Captação. */
export function formatarDataCompleta(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarHora(hora: number): string {
  return `${hora}h`;
}

/** Véspera de uma data. Faz a conta em UTC para não escorregar no horário de verão. */
export function diaAnterior(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const t = new Date(Date.UTC(ano, mes - 1, dia) - 86_400_000);
  return dataISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Como falar do dia da aula que passou: "ontem" e "hoje" soam como conversa;
 * data cheia é o que sobra quando já faz tempo — dizer "ontem" numa aula de
 * cinco dias atrás entrega que a mensagem é de formulário.
 */
export function comoFalarDoDia(data: string, hoje: string = hojeNaAcademia()): string {
  if (data === hoje) return "para hoje";
  if (data === diaAnterior(hoje)) return "para ontem";
  return `para o dia ${formatarDiaMes(data)}`;
}

/**
 * O convite para remarcar quem faltou. Não sai sozinho: cai na caixa de texto
 * da conversa para a recepção ler, ajustar se quiser e enviar.
 */
export function mensagemRemarcarAula(data: string, hoje: string = hojeNaAcademia()): string {
  return [
    "Olá! Tudo bem?",
    "",
    `Percebemos que você tinha uma aula experimental agendada ${comoFalarDoDia(data, hoje)}, mas não conseguiu comparecer.`,
    "",
    "Gostaríamos de saber se você ainda tem interesse em conhecer a academia. Se sim, será um prazer remarcar sua aula experimental! É só nos informar o melhor dia e horário para você. 💪🙏",
    "",
    "Ficamos no aguardo. Até breve!",
  ].join("\n");
}

/**
 * A confirmação que vai para o WhatsApp ao fechar o horário. Texto fixo de
 * propósito: é o comprovante do combinado, e sair sempre igual é o que faz a
 * pessoa reconhecer a mensagem como oficial da academia.
 */
export function mensagemAulaExperimental(input: {
  modalidade: string;
  data: string;
  hora: number;
}): string {
  return [
    "Sua aula experimental foi agendada com sucesso!",
    "",
    `📅 Data: ${formatarDiaMes(input.data)}`,
    `🥋 Modalidade: ${input.modalidade}`,
    `🕐 Horário: ${formatarHora(input.hora)}`,
    "",
    "Estamos felizes em receber você na Academia Coliseu. 💪",
    "",
    "Qualquer dúvida antes da aula, estou à disposição. Nos vemos em breve!",
  ].join("\n");
}
