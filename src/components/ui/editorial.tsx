import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Peças do tabloide (preto, papel e vermelho). Sem estado nem efeito: servem
 * a páginas do servidor e a componentes interativos.
 *
 * Regra de ouro dos cortes diagonais: o corte mora numa camada decorativa
 * (`aria-hidden`, sem eventos) desenhada ATRÁS do conteúdo. O conteúdo em si
 * nunca recebe `clip-path` — foco, sombra de menu e popover não são cortados.
 */

/* ---------- Ícones de status (nunca só cor) ---------- */
function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-3.5 w-3.5 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

export const IconeOk = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M5.4 8.2l1.8 1.8 3.4-3.6" />
  </Svg>
);
export const IconeRelogio = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.8V8l2.2 1.4" />
  </Svg>
);
export const IconeAlerta = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M8 2.2l6.2 11H1.8z" />
    <path d="M8 6.6v3M8 11.6v.1" />
  </Svg>
);
export const IconeInfo = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.3v3.6M8 5v.1" />
  </Svg>
);
export const IconeSetaDireita = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

/* ---------- Listras e faixa ---------- */

/** Bloco de listras diagonais — decoração pura. A cor vem de `text-*`. */
export function Listras({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("listras pointer-events-none block", className)} style={style} />;
}

/* ---------- Badge de status ---------- */

export type TomStatus = "sucesso" | "atencao" | "erro" | "info" | "neutro";

const TOM_BADGE: Record<TomStatus, string> = {
  sucesso: "border-success/35 bg-success-soft text-success",
  atencao: "border-warning/35 bg-warning-soft text-warning",
  erro: "border-danger/35 bg-danger-soft text-danger",
  info: "border-info/35 bg-info-soft text-info",
  neutro: "border-border-strong bg-surface-2 text-muted",
};

const ICONE_STATUS: Record<TomStatus, (p: { className?: string }) => ReactNode> = {
  sucesso: IconeOk,
  atencao: IconeRelogio,
  erro: IconeAlerta,
  info: IconeInfo,
  neutro: IconeInfo,
};

/**
 * Status com cor, ícone E texto — a cor sozinha nunca carrega o sentido.
 * Verde: confirmação/sucesso; âmbar: pendência; vermelho: erro/crítico;
 * azul/neutro: informação. O par claro funciona sobre o papel e sobre o preto.
 */
export function BadgeStatus({
  tom,
  children,
  semIcone = false,
  className,
}: {
  tom: TomStatus;
  children: ReactNode;
  semIcone?: boolean;
  className?: string;
}) {
  const Icone = ICONE_STATUS[tom];
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-semibold",
        TOM_BADGE[tom],
        className,
      )}
    >
      {!semIcone && <Icone />}
      {children}
    </span>
  );
}

/* ---------- Cabeçalho editorial ---------- */

/**
 * Cabeçalho de tela-referência: categoria em mono, manchete condensada,
 * faixa vermelha e uma linha operacional. Use em poucas telas — as demais
 * usam o `PageHeader` compacto (nada de manchete gigante em toda página).
 */
export function CabecalhoEditorial({
  categoria,
  titulo,
  faixa,
  descricao,
  acoes,
  decoracao,
  className,
}: {
  /** Ex.: "Relacionamento / 03" — vai em mono, caixa alta. */
  categoria?: string;
  titulo: string;
  /** Frase curta na faixa vermelha. */
  faixa?: string;
  /** Linha operacional (o achado do dia, o período). */
  descricao?: ReactNode;
  acoes?: ReactNode;
  /** Ilustração estática e secundária (só a partir de `lg`). */
  decoracao?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_auto]", className)}>
      <div className="min-w-0">
        {categoria && <p className="meta-mono text-muted">{categoria}</p>}
        <h1 className="font-manchete mt-2 text-balance text-[2.5rem] text-ink sm:text-[3.25rem] xl:text-[4.25rem]">
          {titulo}
        </h1>
        {faixa && (
          <div className="mt-3 flex max-w-full items-stretch">
            <p className="meta-mono bg-brand px-3 py-1.5 text-[0.6875rem] text-white sm:text-xs">{faixa}</p>
            <Listras className="-ml-px w-10 shrink-0 text-brand sm:w-16" />
          </div>
        )}
        {(descricao || acoes) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {descricao && <div className="min-w-0 max-w-2xl text-sm text-ink sm:text-[0.9375rem]">{descricao}</div>}
            {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
          </div>
        )}
      </div>
      {decoracao && (
        <div aria-hidden className="pointer-events-none hidden self-end lg:block">
          {decoracao}
        </div>
      )}
    </header>
  );
}

/* ---------- Painel com detalhe angular ---------- */

/**
 * Painel com o canto cortado na diagonal. O fundo e a moldura são duas camadas
 * decorativas recortadas; o conteúdo fica por cima, sem recorte.
 *
 * - `escuro`: degrau `painel` sobre o preto, com fio claro acompanhando o corte.
 * - `papel`: papel com tinta (tokens do papel via `contexto-papel`).
 */
export function PainelAngular<T extends ElementType = "section">({
  as,
  tom = "escuro",
  corte = 18,
  className,
  children,
  ...rest
}: {
  as?: T;
  tom?: "escuro" | "papel";
  /** Tamanho do corte diagonal em px. */
  corte?: number;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "section") as ElementType;
  const estilo = { "--corte": `${corte}px` } as CSSProperties;
  return (
    <Tag
      {...rest}
      className={cn("relative isolate min-w-0", tom === "papel" ? "contexto-papel" : "text-ink", className)}
    >
      <span
        aria-hidden
        style={estilo}
        className={cn(
          "corte-canto pointer-events-none absolute inset-0 -z-10",
          tom === "papel" ? "bg-[#d6d0c3]" : "bg-white/16",
        )}
      />
      <span
        aria-hidden
        style={estilo}
        className={cn(
          "corte-canto pointer-events-none absolute inset-px -z-10",
          tom === "papel" ? "bg-surface" : "bg-painel",
        )}
      />
      {children}
    </Tag>
  );
}

/* ---------- Faixa de seção ---------- */

/** Título de seção: marcador vermelho, rótulo condensado e um fio até a borda. */
export function FaixaSecao({
  titulo,
  id,
  numero,
  acao,
  as: Tag = "h2",
  className,
}: {
  titulo: string;
  id?: string;
  /** Numeração editorial opcional ("01"). */
  numero?: string;
  acao?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {numero ? (
        <span aria-hidden className="meta-mono bg-ink px-1.5 py-0.5 text-[0.6875rem] text-bg">
          {numero}
        </span>
      ) : (
        <span aria-hidden className="h-4 w-1 shrink-0 bg-brand" />
      )}
      <Tag id={id} className="font-display text-[0.9375rem] font-semibold uppercase tracking-[0.06em] text-ink">
        {titulo}
      </Tag>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-border" />
      {acao}
    </div>
  );
}

/* ---------- Cartão de indicador ---------- */

export type EstadoIndicador =
  | { tipo: "ok"; valor: number }
  | { tipo: "carregando" }
  | { tipo: "erro" };

/**
 * Indicador do tabloide: papel, fio vermelho no topo, numeração editorial e o
 * número grande. Carregando = barra cinza do tamanho do número (sem shimmer);
 * erro = "indisponível" — nunca um zero falso.
 */
export function CartaoIndicador({
  numero,
  rotulo,
  periodo,
  estado,
  icone,
  className,
}: {
  numero: string;
  rotulo: string;
  /** O período/critério em palavras: "outubro de 2026", "20/10 a 26/10". */
  periodo: string;
  estado: EstadoIndicador;
  icone?: ReactNode;
  className?: string;
}) {
  return (
    <PainelAngular
      as="div"
      tom="papel"
      corte={12}
      aria-busy={estado.tipo === "carregando" || undefined}
      // Celular: uma linha (número e rótulo à esquerda, valor à direita).
      // A partir de `sm`: cartão em coluna, com o valor grande embaixo.
      className={cn(
        "flex min-h-16 items-center gap-3 overflow-hidden px-3 pb-3 pt-[calc(0.75rem+3px)]",
        "sm:min-h-[7.25rem] sm:flex-col sm:items-stretch sm:gap-0 sm:p-0 sm:pt-[3px]",
        className,
      )}
    >
      {/* fio vermelho do topo + listras do canto: decoração */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-brand" />
      <Listras className="absolute -right-1 bottom-0 hidden h-full w-16 text-brand/90 [mask-image:linear-gradient(200deg,transparent_45%,#000_46%)] sm:block lg:w-20" />

      <div className="flex min-w-0 flex-1 items-start gap-3 sm:flex-none sm:px-4 sm:pt-3">
        <span aria-hidden className="meta-mono shrink-0 bg-ink px-1.5 py-0.5 text-[0.6875rem] text-surface">
          {numero}
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold uppercase leading-tight tracking-[0.05em] text-ink">
            {rotulo}
          </p>
          <p className="mt-0.5 text-xs text-muted sm:hidden">{periodo}</p>
        </div>
      </div>

      <div className="relative flex shrink-0 items-end gap-2 sm:mt-auto sm:px-4 sm:pb-3 sm:pr-16 lg:pr-20">
        {icone && <span className="mb-1.5 hidden text-ink sm:block">{icone}</span>}
        <div className="min-w-0">
          {estado.tipo === "ok" && (
            <p className="font-display text-[2rem] font-bold leading-none tabular-nums text-ink sm:text-[2.5rem]">
              {String(estado.valor).padStart(2, "0")}
            </p>
          )}
          {estado.tipo === "carregando" && (
            <>
              <span aria-hidden className="block h-8 w-14 bg-surface-2 sm:h-10" />
              <span className="sr-only">Carregando</span>
            </>
          )}
          {estado.tipo === "erro" && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-alerta">
              <IconeAlerta />
              Indisponível
            </p>
          )}
          <p className="mt-1.5 hidden text-xs text-muted sm:block">{periodo}</p>
        </div>
      </div>
    </PainelAngular>
  );
}

/* ---------- Estado vazio / erro ---------- */

/**
 * Vazio, erro ou falta de dado dentro do bloco (o frame continua). Erro tem
 * `role="alert"`, ícone e texto — nunca vira zero.
 */
export function EstadoVazio({
  titulo,
  children,
  acao,
  tom = "vazio",
  className,
}: {
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
  tom?: "vazio" | "erro";
  className?: string;
}) {
  return (
    <div
      role={tom === "erro" ? "alert" : undefined}
      className={cn("flex flex-col items-start gap-2 border border-dashed border-border-strong px-4 py-5", className)}
    >
      <p className={cn("flex items-center gap-2 text-sm font-semibold", tom === "erro" ? "text-alerta" : "text-ink")}>
        {tom === "erro" ? <IconeAlerta /> : <IconeInfo className="text-muted" />}
        {titulo}
      </p>
      {children && <div className="text-sm text-muted">{children}</div>}
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}

/* ---------- Barra de ferramentas ---------- */

/** Linha de abas, filtros e ações: escopo à esquerda, utilidades à direita. */
export function BarraFerramentas({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>{children}</div>
  );
}
