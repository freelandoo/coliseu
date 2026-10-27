import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { formatarDataCompleta, formatarHora, hojeNaAcademia } from "@/lib/aula-experimental";
import {
  LIMITE_DIAS_AULA,
  aulasAnterioresRepo,
  esgotouAulas,
  type AulaAnterior,
} from "@/lib/repositories/aulas-experimentais";

/**
 * Até 3 dias de aula experimental por pessoa (era uma, pedido de 26/10/2026;
 * passou a 3 em 27/10/2026), valendo para os dois caminhos de agendamento —
 * balcão e conversa do Atendimento.
 *
 * Casa por CPF (obrigatório daqui em diante) ou por telefone + primeiro nome,
 * no sistema e na planilha antiga. Contam os dias que fez e os que tem
 * marcados; falta (na agenda ou na planilha) não conta. ADMIN pode liberar
 * mesmo assim (`forcar`) — exceção consciente, não atalho do balcão.
 */
export type ConferenciaAula =
  | { ok: true; cpf: string; anteriores: AulaAnterior[] }
  | { ok: false; status: number; erro: string; anteriores?: AulaAnterior[] };

export function descreverAnterior(a: AulaAnterior): string {
  const quando = a.data ? `${formatarDataCompleta(a.data)}${a.hora !== null ? ` às ${formatarHora(a.hora)}` : ""}` : "data sem registro";
  const onde = a.origem === "planilha" ? "planilha antiga" : "agenda";
  const como = a.porque === "cpf" ? "mesmo CPF" : "mesmo telefone e primeiro nome";
  return `${a.nome} — ${a.modalidade ?? "aula"} em ${quando} (${onde}, ${como})`;
}

/** "Já usou os 3 dias: Fulano — Boxe em …; …" (para a tela e para o erro). */
export function descreverEsgotado(usados: AulaAnterior[]): string {
  return `já usou os ${LIMITE_DIAS_AULA} dias de aula experimental: ${usados.map(descreverAnterior).join("; ")}`;
}

export async function conferirAulaNova(input: {
  cpf: unknown;
  telefone: string | null;
  nome: string | null;
  forcar?: unknown;
  papel?: string;
}): Promise<ConferenciaAula> {
  const cpf = normalizarCpf(typeof input.cpf === "string" ? input.cpf : "");
  if (!cpfValido(cpf)) {
    return { ok: false, status: 400, erro: `Informe um CPF válido — é ele que limita a aula experimental a ${LIMITE_DIAS_AULA} dias por pessoa.` };
  }

  const anteriores = await aulasAnterioresRepo({ cpf, telefone: input.telefone, nome: input.nome }, hojeNaAcademia());
  const usados = esgotouAulas(anteriores);
  if (usados && !(input.forcar === true && input.papel === "ADMIN")) {
    return {
      ok: false,
      status: 409,
      erro: `Esta pessoa ${descreverEsgotado(usados)}. Se ela faltou em alguma, marque "Faltou" no Histórico e agende de novo.`,
      anteriores,
    };
  }
  return { ok: true, cpf, anteriores };
}
