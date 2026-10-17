/**
 * Papéis e módulos — puro, sem prisma nem next/headers, para poder ser
 * importado também pelo client (o menu filtra por aqui).
 */

export type Papel = "ADMIN" | "RECEPCAO" | "TECNICO";

export function podePapel(papel: Papel, exigidos: Papel[]): boolean {
  if (papel === "ADMIN") return true;
  return exigidos.includes(papel);
}

/**
 * Módulos do menu — a raiz de cada área do sistema.
 *
 * O nome é o caminho da rota (`/captacao`, `/aula-experimental`): `rotaInicial`
 * conta com isso para mandar quem não tem atendimento à primeira tela da lista.
 */
export type Modulo =
  | "painel"
  | "matriculados"
  | "captacao"
  | "aula-experimental"
  | "atendimento"
  | "cobranca"
  | "custos"
  | "acesso"
  | "relatorios";

/**
 * Colaborador cuida do balcão: matrícula, captação e a catraca (biometria no
 * ato da matrícula). Painel, dinheiro e relatórios ficam com o admin.
 * A ordem é a do menu — a tela inicial é decidida por `rotaInicial`.
 */
const MODULOS_POR_PAPEL: Record<Papel, Modulo[]> = {
  ADMIN: ["painel", "matriculados", "captacao", "aula-experimental", "atendimento", "cobranca", "custos", "acesso", "relatorios"],
  RECEPCAO: ["matriculados", "captacao", "aula-experimental", "atendimento", "acesso"],
  TECNICO: ["acesso"],
};

export function modulosDoPapel(papel: Papel): Modulo[] {
  return MODULOS_POR_PAPEL[papel] ?? [];
}

export function podeModulo(papel: Papel, modulo: Modulo): boolean {
  return modulosDoPapel(papel).includes(modulo);
}

/**
 * A lixeira de conversas (/backup) é da manutenção do sistema, não do negócio:
 * ela expõe conversa que o admin mandou apagar. Por isso não é um módulo de
 * papel — é a flag `desenvolvedor` na conta, e ADMIN não passa por ela.
 */
export function podeBackup(user: { desenvolvedor?: boolean } | null | undefined): boolean {
  return user?.desenvolvedor === true;
}

/**
 * Para onde mandar o usuário depois do login (ou quando bate numa tela vedada).
 *
 * O admin entra na central (/painel): ela junta as conversas esperando
 * resposta, a agenda de aulas experimentais e o que está em aberto — e leva
 * direto a cada uma. Quem atende (recepção) cai no Atendimento, a tela que
 * não pode esperar: mensagem de lead chega o dia inteiro e quem abre o
 * sistema abre para responder.
 *
 * Quem não tem nenhum dos dois (o técnico só enxerga a catraca) cai no
 * primeiro módulo da sua lista: mandar todo mundo para uma tela fixa faria o
 * guard de módulo devolver essa gente para cá em looping.
 */
export function rotaInicial(papel: Papel): string {
  if (podeModulo(papel, "painel")) return "/painel";
  if (podeModulo(papel, "atendimento")) return "/atendimento";
  return `/${modulosDoPapel(papel)[0] ?? "perfil"}`;
}
