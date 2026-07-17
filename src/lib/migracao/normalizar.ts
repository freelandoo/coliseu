/**
 * Normalização de nomes, CPFs e datas para a migração CloudGym → Coliseu.
 *
 * Os exports do iDFace perderam os acentos: cada letra acentuada virou U+FFFD
 * ("Jo�o"). Tratamos esse caractere como CURINGA de exatamente uma letra, o que
 * permite casar "Jo�o Victor" com "João Victor" sem inventar acento nenhum.
 */

export const CURINGA = "#";
const U_FFFD = "�";

/**
 * Nome canônico para casamento: sem acento, maiúsculo, só letras e espaço,
 * espaços colapsados. U+FFFD vira o CURINGA (uma letra perdida no export).
 */
export function normalizarNome(nome: string): string {
  const semAcento = nome
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
  return semAcento
    .toUpperCase()
    .replace(new RegExp(U_FFFD, "g"), CURINGA)
    .replace(/[^A-Z#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome normalizado contém letras perdidas no export? */
export function temCuringa(nomeNorm: string): boolean {
  return nomeNorm.includes(CURINGA);
}

/** Regex que casa o nome com curinga contra nomes normalizados sem curinga. */
export function regexDeCuringa(nomeNorm: string): RegExp {
  const escapado = nomeNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapado.replace(/#/g, "[A-Z]")}$`);
}

/** CPF canônico: só dígitos; "" quando vazio ou tamanho inválido. */
export function normalizarCpf(cpf: string | null | undefined): string {
  const digitos = (cpf ?? "").replace(/\D/g, "");
  return digitos.length === 11 ? digitos : "";
}

/** "24/02/2026" → "2026-02-24"; null quando não parece data BR. */
export function dataBRparaISO(data: string | null | undefined): string | null {
  const m = (data ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (d.getUTCDate() !== Number(dia) || d.getUTCMonth() !== Number(mes) - 1) return null;
  return `${ano}-${mes}-${dia}`;
}
