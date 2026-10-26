import { normalizar } from "@/lib/whatsapp/busca";

/**
 * Uma busca de pessoa para todas as listas: nome sem acento e sem diferença de
 * maiúscula ("deborah" acha "Déborah"), código (CD…), CPF e telefone — com ou
 * sem pontuação. Em 26/10/2026 a recepção procurou a Deborah pelo CPF, a lista
 * só olhava nome e telefone, e o cadastro antigo dela ficou duplicado.
 *
 * Termo só com números (3+ dígitos) procura em CPF, telefone e código; com
 * letras, no nome e no código — "Lote 119" não casa com todo celular "(11) 9…".
 */
export interface PessoaBuscavel {
  nome: string;
  codigo?: string | null;
  cpf?: string | null;
  telefone?: string | null;
}

const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

export function casaPessoa(p: PessoaBuscavel, termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return true;
  const d = soDigitos(termo);
  const soNumero = !/\p{L}/u.test(termo);
  if (soNumero) {
    if (d.length < 3) return false;
    return soDigitos(p.cpf).includes(d) || soDigitos(p.telefone).includes(d) || soDigitos(p.codigo).includes(d);
  }
  return normalizar(p.nome).includes(t) || normalizar(p.codigo ?? "").includes(t);
}
