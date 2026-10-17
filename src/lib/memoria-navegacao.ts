/**
 * Memória de navegação da aba — só em memória do JavaScript.
 *
 * Guarda o mínimo para "voltar para onde eu estava" (busca, situação, posição,
 * qual pessoa foi aberta). A busca pode ter CPF ou telefone, então não vai para
 * URL, log, localStorage nem sessionStorage: morre no reload, ao fechar a aba e
 * ao sair da conta (o logout recarrega a página). Nunca guarda ficha nenhuma.
 */

export interface ConsultaAlunos {
  busca: string;
  situacao: string;
  /** Pessoa aberta a partir da lista e a rolagem naquele momento. */
  abriu?: { id: string; rolagem: number };
}

let consultaAlunos: ConsultaAlunos | null = null;
const ouvintes = new Set<() => void>();

export function lembrarConsultaAlunos(c: ConsultaAlunos | null): void {
  consultaAlunos = c;
  for (const o of ouvintes) o();
}

export function consultaAlunosLembrada(): ConsultaAlunos | null {
  return consultaAlunos;
}

/** Para `useSyncExternalStore`. */
export function assinarConsultaAlunos(aviso: () => void): () => void {
  ouvintes.add(aviso);
  return () => ouvintes.delete(aviso);
}
