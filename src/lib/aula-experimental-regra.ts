import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { formatarDataCompleta, formatarHora, hojeNaAcademia } from "@/lib/aula-experimental";
import { aulasAnterioresRepo, jaFez, type AulaAnterior } from "@/lib/repositories/aulas-experimentais";

/**
 * Uma aula experimental por pessoa (pedido de 26/10/2026), valendo para os dois
 * caminhos de agendamento — balcão e conversa do Atendimento.
 *
 * Casa por CPF (obrigatório daqui em diante) ou por telefone + primeiro nome,
 * no sistema e na planilha antiga. Quem já fez não marca outra; quem faltou
 * (marcado na agenda ou na planilha) pode. ADMIN pode liberar mesmo assim
 * (`forcar`) — exceção consciente, não atalho do balcão.
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

export async function conferirAulaNova(input: {
  cpf: unknown;
  telefone: string | null;
  nome: string | null;
  forcar?: unknown;
  papel?: string;
}): Promise<ConferenciaAula> {
  const cpf = normalizarCpf(typeof input.cpf === "string" ? input.cpf : "");
  if (!cpfValido(cpf)) return { ok: false, status: 400, erro: "Informe um CPF válido — é ele que garante uma aula experimental por pessoa." };

  const anteriores = await aulasAnterioresRepo({ cpf, telefone: input.telefone, nome: input.nome }, hojeNaAcademia());
  const fez = jaFez(anteriores);
  if (fez && !(input.forcar === true && input.papel === "ADMIN")) {
    return {
      ok: false,
      status: 409,
      erro: `Esta pessoa já fez aula experimental: ${descreverAnterior(fez)}. Se ela faltou, marque "Faltou" no Histórico e agende de novo.`,
      anteriores,
    };
  }
  return { ok: true, cpf, anteriores };
}
