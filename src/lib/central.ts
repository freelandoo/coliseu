/**
 * Contas de calendário e de texto da central do admin (/painel).
 *
 * Tudo no relógio da academia (`FUSO_ACADEMIA`), como a agenda: o servidor
 * roda em UTC e a central é renderizada lá — sem fixar o fuso, às 22h de um
 * sábado a tela diria que já é domingo. Datas viajam como "AAAA-MM-DD".
 */
import { dataISO, FUSO_ACADEMIA } from "@/lib/aula-experimental";

/** Quantos dias a faixa da agenda mostra, contando hoje. */
export const DIAS_NA_FAIXA = 7;

/** Quantas conversas cada lista da central traz — é um resumo, não o inbox. */
export const CONVERSAS_NA_CENTRAL = 6;

/** Soma dias a uma data "AAAA-MM-DD". Conta em UTC para não escorregar no horário de verão. */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const t = new Date(Date.UTC(ano, mes - 1, dia) + dias * 86_400_000);
  return dataISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export interface DiaFaixa {
  data: string;
  /** "sáb" */
  semana: string;
  /** "17" */
  dia: string;
  /** "sábado, 17 de outubro" — para leitor de tela */
  porExtenso: string;
}

/** Meio-dia UTC do dia: longe das bordas, qualquer fuso lê a mesma data. */
function meioDia(data: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

function formatar(data: string, opcoes: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opcoes }).format(meioDia(data));
}

/** "sábado, 17 de outubro" */
export function dataPorExtenso(data: string): string {
  return formatar(data, { weekday: "long", day: "numeric", month: "long" });
}

/** De hoje em diante, `quantos` dias seguidos. */
export function faixaDeDias(hoje: string, quantos: number = DIAS_NA_FAIXA): DiaFaixa[] {
  return Array.from({ length: quantos }, (_, i) => {
    const data = somarDias(hoje, i);
    return {
      data,
      semana: formatar(data, { weekday: "short" }).replace(".", ""),
      dia: String(Number(data.slice(8))),
      porExtenso: dataPorExtenso(data),
    };
  });
}

/** "OUT / 2026" — o rodapé do número grande da abertura. */
export function mesEAno(data: string): string {
  const mes = formatar(data, { month: "short" }).replace(".", "").toUpperCase();
  return `${mes} / ${data.slice(0, 4)}`;
}

/** Hora (0–23) agora no relógio da academia. */
export function horaNaAcademia(agora: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_ACADEMIA,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(agora);
  return Number(h);
}

export function saudacao(agora: Date = new Date()): string {
  const h = horaNaAcademia(agora);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeiro nome, para a saudação — "Alex Rodrigues" → "Alex". */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/**
 * Quando foi a última mensagem, do jeito que o balcão lê: hora se foi hoje,
 * "ontem", ou dia/mês.
 */
export function quandoFoi(iso: string, hoje: string): string {
  const instante = new Date(iso);
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_ACADEMIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
  if (dia === hoje) {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: FUSO_ACADEMIA,
      hour: "2-digit",
      minute: "2-digit",
    }).format(instante);
  }
  if (dia === somarDias(hoje, -1)) return "ontem";
  return `${dia.slice(8)}/${dia.slice(5, 7)}`;
}

/** Duas iniciais para o avatar da conversa. Telefone puro vira "#". */
export function iniciais(nome: string): string {
  const letras = nome
    .split(/\s+/)
    .map((p) => p.match(/\p{L}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letras || "#";
}

/** Destinos reais da central — a conversa no Atendimento e o dia na agenda. */
export const linkConversa = (id: string) => `/atendimento?c=${encodeURIComponent(id)}`;
export const linkAgendaDoDia = (data: string) => `/aula-experimental?dia=${data}`;
