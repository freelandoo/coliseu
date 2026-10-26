/**
 * Mapa de navegação do app autenticado — puro (sem prisma, sessão ou React),
 * importável pelo menu, pelo cabeçalho e pelas páginas.
 *
 * Rótulos podem mudar sem mudar URL: "Alunos" continua em /matriculados,
 * "Despesas" em /custos, "Controle de acesso" em /acesso, "Minha conta" em /perfil.
 *
 * Esconder um link não autoriza nem desautoriza nada: o guard de cada página
 * é quem barra. O menu só não oferece porta fechada.
 */
import { podeBackup, podeModulo, type Modulo, type Papel } from "@/lib/auth/modulos";

export type IconeNav =
  | "chat"
  | "funil"
  | "calendario"
  | "treino"
  | "painel"
  | "pessoas"
  | "cobranca"
  | "despesas"
  | "relatorios"
  | "acesso"
  | "conta"
  | "backup";

export interface DestinoNav {
  href: string;
  rotulo: string;
  icone: IconeNav;
  /** Módulo da matriz de papéis; ausente = regra própria (`acesso`). */
  modulo?: Modulo;
  /** `todos` = qualquer conta logada; `dev` = só a flag desenvolvedor. */
  acesso?: "todos" | "dev";
}

export interface GrupoNav {
  id: string;
  rotulo: string;
  itens: DestinoNav[];
}

/**
 * Ordem do dia do balcão: o que se usa o dia inteiro em cima ("Dia a dia"),
 * dinheiro e números do admin no meio, a catraca e a conta embaixo. O admin
 * abre no Painel, que encabeça a lista.
 */
export const GRUPOS_NAV: GrupoNav[] = [
  {
    id: "dia",
    rotulo: "Dia a dia",
    itens: [
      { href: "/painel", rotulo: "Painel", icone: "painel", modulo: "painel" },
      { href: "/atendimento", rotulo: "Atendimento", icone: "chat", modulo: "atendimento" },
      { href: "/matriculados", rotulo: "Alunos", icone: "pessoas", modulo: "matriculados" },
      { href: "/captacao", rotulo: "Captação", icone: "funil", modulo: "captacao" },
      { href: "/aula-experimental", rotulo: "Aula experimental", icone: "calendario", modulo: "aula-experimental" },
      { href: "/treinos", rotulo: "Treinos", icone: "treino", modulo: "treinos" },
    ],
  },
  {
    id: "gestao",
    rotulo: "Gestão",
    itens: [
      { href: "/cobranca", rotulo: "Cobrança", icone: "cobranca", modulo: "cobranca" },
      { href: "/custos", rotulo: "Despesas", icone: "despesas", modulo: "custos" },
      { href: "/relatorios", rotulo: "Relatórios", icone: "relatorios", modulo: "relatorios" },
    ],
  },
  {
    id: "operacao",
    rotulo: "Operação",
    itens: [{ href: "/acesso", rotulo: "Controle de acesso", icone: "acesso", modulo: "acesso" }],
  },
  {
    id: "conta",
    rotulo: "Conta e manutenção",
    itens: [
      { href: "/perfil", rotulo: "Minha conta", icone: "conta", acesso: "todos" },
      { href: "/backup", rotulo: "Backup", icone: "backup", acesso: "dev" },
    ],
  },
];

export function podeVerDestino(d: DestinoNav, papel: Papel, desenvolvedor: boolean): boolean {
  if (d.acesso === "todos") return true;
  if (d.acesso === "dev") return podeBackup({ desenvolvedor });
  return d.modulo !== undefined && podeModulo(papel, d.modulo);
}

/** Grupos com só o que a conta abre; grupo vazio some. */
export function gruposVisiveis(papel: Papel, desenvolvedor: boolean): GrupoNav[] {
  return GRUPOS_NAV.map((g) => ({
    ...g,
    itens: g.itens.filter((d) => podeVerDestino(d, papel, desenvolvedor)),
  })).filter((g) => g.itens.length > 0);
}

/** `pathname` está em `href` ou numa subrota dele (sem casar /captacao com /captacao-x). */
export function dentroDe(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Entre vários hrefs, o que melhor descreve `pathname`: o prefixo mais longo.
 * Garante uma opção ativa só — /matriculados/retencao acende Retenção, não a lista.
 */
export function maisEspecifico(pathname: string, hrefs: readonly string[]): string | null {
  let melhor: string | null = null;
  for (const h of hrefs) {
    if (dentroDe(pathname, h) && (melhor === null || h.length > melhor.length)) melhor = h;
  }
  return melhor;
}

const TODOS_DESTINOS = GRUPOS_NAV.flatMap((g) => g.itens);

/** Item do menu global que corresponde à rota (inclui subrotas e fichas). */
export function destinoAtivo(pathname: string): DestinoNav | null {
  const href = maisEspecifico(
    pathname,
    TODOS_DESTINOS.map((d) => d.href),
  );
  return TODOS_DESTINOS.find((d) => d.href === href) ?? null;
}

/* ---------- subnavegação por rota ---------- */

export interface SecaoNav {
  href: string;
  rotulo: string;
}

export const SECOES_ALUNOS: SecaoNav[] = [
  { href: "/matriculados", rotulo: "Lista de alunos" },
  { href: "/matriculados/renovar", rotulo: "Matrículas e renovações" },
  { href: "/matriculados/retencao", rotulo: "Retenção" },
  { href: "/matriculados/fidelidade", rotulo: "Fidelidade" },
];

export const SECOES_FIDELIDADE: SecaoNav[] = [
  { href: "/matriculados/fidelidade", rotulo: "Tempo de casa" },
  { href: "/matriculados/fidelidade/indicadores", rotulo: "Indicadores" },
];

/**
 * Seção ativa de uma subnavegação. A raiz só casa exatamente — a ficha
 * (/matriculados/<id>) não é a "Lista de alunos", e nenhuma aba acende nela.
 */
export function secaoAtiva(pathname: string, secoes: readonly SecaoNav[]): string | null {
  const [raiz, ...resto] = secoes.map((s) => s.href);
  if (pathname === raiz) return raiz;
  return maisEspecifico(pathname, resto);
}

/* ---------- localização (breadcrumb) ---------- */

export interface Migalha {
  rotulo: string;
  href?: string;
}

const ROTULOS_SUBROTA: Record<string, string> = {
  "/matriculados/renovar": "Matrículas e renovações",
  "/matriculados/retencao": "Retenção",
  "/matriculados/fidelidade": "Fidelidade",
  "/matriculados/fidelidade/indicadores": "Indicadores",
  "/atendimento/uso": "Uso",
};

/**
 * Onde a pessoa está, só com o que a URL diz (sem buscar dado para isso):
 * módulo → seção. Uma ficha de aluno vira "Alunos → Ficha".
 */
export function migalhas(pathname: string): Migalha[] {
  const destino = destinoAtivo(pathname);
  if (!destino) return [];
  const raiz: Migalha = { rotulo: destino.rotulo, href: destino.href };
  if (pathname === destino.href) return [{ rotulo: destino.rotulo }];

  const trilha: Migalha[] = [raiz];
  if (pathname === "/matriculados/fidelidade/indicadores") {
    trilha.push({ rotulo: "Fidelidade", href: "/matriculados/fidelidade" });
  }
  const rotulo =
    ROTULOS_SUBROTA[pathname] ?? (destino.href === "/matriculados" ? "Ficha" : null);
  if (rotulo) trilha.push({ rotulo });
  return trilha;
}

/* ---------- parâmetros de URL ---------- */

/** Valor aceito ou o padrão; nunca devolve o texto cru da URL. */
export function lerEnum<T extends string>(
  valor: string | null | undefined,
  aceitos: readonly T[],
  padrao: T,
): T {
  return valor && (aceitos as readonly string[]).includes(valor) ? (valor as T) : padrao;
}

export const ABAS_COBRANCA = ["cobrancas", "vencimentos", "planos"] as const;
export type AbaCobranca = (typeof ABAS_COBRANCA)[number];

export const VISOES_AGENDA = ["calendario", "lista", "historico"] as const;
export type VisaoAgenda = (typeof VISOES_AGENDA)[number];

export const SITUACOES_ALUNO = ["todos", "ativo", "pendente", "inadimplente", "cancelado"] as const;
export type SituacaoAluno = (typeof SITUACOES_ALUNO)[number];

/** Filtro do app de treinos na lista de alunos (`?app=`). */
export const FILTROS_APP_ALUNO = ["todos", "na_freelandoo", "sem_conta", "falta_dado", "treino_vencido"] as const;
export type FiltroAppAluno = (typeof FILTROS_APP_ALUNO)[number];

/**
 * Ids opacos que podem viajar na URL (pessoa, conversa). Qualquer outra coisa
 * vira `null` — não chega a consulta nem a montar link.
 */
export function idSeguro(valor: string | null | undefined): string | null {
  return valor && /^[A-Za-z0-9_-]{1,64}$/.test(valor) ? valor : null;
}

/**
 * Troca um parâmetro preservando os outros. `null` (ou o padrão) remove —
 * a URL do estado padrão fica limpa.
 */
export function comParametro(
  atual: string,
  chave: string,
  valor: string | null,
  padrao?: string,
): string {
  const p = new URLSearchParams(atual);
  if (valor === null || valor === padrao) p.delete(chave);
  else p.set(chave, valor);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ---------- retorno da ficha ---------- */

export const ORIGENS_FICHA = [
  "alunos",
  "atendimento",
  "vencimentos",
  "captacao",
  "retencao",
  "fidelidade",
  "treinos",
] as const;
export type OrigemFicha = (typeof ORIGENS_FICHA)[number];

/** Faixas do filtro da Retenção (7 / 14 / 21 dias), como vão na URL. */
export const FAIXAS_RETENCAO = ["todos", "frequente", "7", "14", "21"] as const;
export type FaixaRetencao = (typeof FAIXAS_RETENCAO)[number];

/**
 * Para onde o "voltar" da ficha leva. Só destinos conhecidos (allowlist) e só
 * se a conta abre o módulo; o resto cai na lista de alunos. Nunca aceita URL.
 * A Retenção volta na faixa em que estava (`faixa`, também por allowlist).
 */
export function retornoDaFicha(
  de: string | null | undefined,
  conversa: string | null | undefined,
  papel: Papel,
  faixa?: string | null,
): { href: string; rotulo: string; origem: OrigemFicha } {
  const origem = lerEnum(de, ORIGENS_FICHA, "alunos");
  if (origem === "atendimento" && podeModulo(papel, "atendimento")) {
    const c = idSeguro(conversa);
    return {
      href: c ? `/atendimento?c=${c}` : "/atendimento",
      rotulo: "Atendimento",
      origem,
    };
  }
  if (origem === "vencimentos" && podeModulo(papel, "cobranca")) {
    return { href: "/cobranca?aba=vencimentos", rotulo: "Vencimentos", origem };
  }
  if (origem === "captacao" && podeModulo(papel, "captacao")) {
    return { href: "/captacao", rotulo: "Captação", origem };
  }
  if (origem === "retencao" && podeModulo(papel, "matriculados")) {
    const f = lerEnum(faixa, FAIXAS_RETENCAO, "todos");
    const href = f === "todos" ? "/matriculados/retencao" : `/matriculados/retencao?faixa=${f}`;
    return { href, rotulo: "Retenção", origem };
  }
  if (origem === "fidelidade" && podeModulo(papel, "matriculados")) {
    return { href: "/matriculados/fidelidade", rotulo: "Fidelidade", origem };
  }
  if (origem === "treinos" && podeModulo(papel, "treinos")) {
    return { href: "/treinos", rotulo: "Treinos", origem };
  }
  return { href: "/matriculados", rotulo: "Alunos", origem: "alunos" };
}
