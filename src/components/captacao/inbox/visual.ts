import type { ConversaInteresse, ConversaResumo } from "@/lib/types";

/** Ponto na cor da bandeira do estágio — a mesma língua da Captação. */
export const PONTO: Record<ConversaInteresse, string> = {
  nao_classificado: "bg-surface ring-1 ring-control",
  com_interesse: "bg-warning",
  sem_interesse: "bg-info",
  perdido: "bg-danger",
  convertido: "bg-success",
};

/** Linha da lista: a conversa, mais o trecho quando ela veio da busca. */
export type LinhaConversa = ConversaResumo & { trecho?: string };

/** Hora se foi hoje; dia/mês se foi antes. */
export function quando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function somaNaoLidas(lista: ConversaResumo[]) {
  return lista.reduce((total, c) => total + c.naoLidas, 0);
}
