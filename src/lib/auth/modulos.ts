/**
 * Papéis e módulos — puro, sem prisma nem next/headers, para poder ser
 * importado também pelo client (o menu filtra por aqui).
 */

export type Papel = "ADMIN" | "RECEPCAO" | "TECNICO";

export function podePapel(papel: Papel, exigidos: Papel[]): boolean {
  if (papel === "ADMIN") return true;
  return exigidos.includes(papel);
}

/** Módulos do menu — a raiz de cada área do sistema. */
export type Modulo =
  | "painel"
  | "matriculados"
  | "captacao"
  | "cobranca"
  | "custos"
  | "acesso"
  | "relatorios";

/**
 * Colaborador cuida do balcão: matrícula, captação e a catraca (biometria no
 * ato da matrícula). Painel, dinheiro e relatórios ficam com o admin.
 * A ordem importa: o primeiro módulo da lista é a tela inicial do papel.
 */
const MODULOS_POR_PAPEL: Record<Papel, Modulo[]> = {
  ADMIN: ["painel", "matriculados", "captacao", "cobranca", "custos", "acesso", "relatorios"],
  RECEPCAO: ["matriculados", "captacao", "acesso"],
  TECNICO: ["acesso"],
};

export function modulosDoPapel(papel: Papel): Modulo[] {
  return MODULOS_POR_PAPEL[papel] ?? [];
}

export function podeModulo(papel: Papel, modulo: Modulo): boolean {
  return modulosDoPapel(papel).includes(modulo);
}

/** Para onde mandar o usuário depois do login (ou quando bate numa tela vedada). */
export function rotaInicial(papel: Papel): string {
  return `/${modulosDoPapel(papel)[0] ?? "perfil"}`;
}
