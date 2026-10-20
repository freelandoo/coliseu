import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Peças visuais da central (/painel). Sem estado nem efeito: servem tanto aos
 * blocos do servidor quanto aos interativos.
 */

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-[18px] w-[18px] shrink-0", className)}
    >
      {children}
    </svg>
  );
}

export const IconeConversa = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M15.5 8.6c0 3.4-2.9 6-6.5 6-.8 0-1.5-.1-2.1-.3L3 15.5l1-3C3.1 11.4 2.5 10 2.5 8.6c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6z" />
  </Svg>
);
export const IconeCalendario = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect x="2.5" y="3.5" width="13" height="12" rx="1.6" />
    <path d="M2.5 7.3h13M6 2v3M12 2v3" />
  </Svg>
);
export const IconePessoas = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="7" cy="6" r="2.6" />
    <path d="M2.5 15c0-2.6 2-4.4 4.5-4.4s4.5 1.8 4.5 4.4" />
    <path d="M12 3.6a2.5 2.5 0 010 4.8M13.5 10.9c1.3.6 2 1.9 2 3.6" />
  </Svg>
);
export const IconeCobranca = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect x="2" y="4" width="14" height="10" rx="1.6" />
    <path d="M2 7.5h14M5 11h3" />
  </Svg>
);
export const IconeMatricula = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M9 2.2l1.6 1.2 2-.1.6 1.9 1.6 1.2-.6 1.9.6 1.9-1.6 1.2-.6 1.9-2-.1L9 12.4l-1.6-1.2-2 .1-.6-1.9-1.6-1.2.6-1.9-.6-1.9 1.6-1.2.6-1.9 2 .1z" />
    <path d="M6.8 7.4l1.5 1.5 3-3" />
    <path d="M6.5 12.5L5.5 16l3.5-1.6 3.5 1.6-1-3.5" />
  </Svg>
);
/** Seta de "abrir": dentro de um link `group`, avança na diagonal no hover. */
export const IconeSeta = ({ className }: { className?: string }) => (
  <Svg
    className={cn(
      "h-4 w-4 transition-transform duration-200 ease-entrada group-hover:-translate-y-0.5 group-hover:translate-x-0.5",
      className,
    )}
  >
    <path d="M5.5 12.5l7-7M7 5.5h5.5V11" />
  </Svg>
);

/** Superfície de papel da central: cantos quase retos, sem sombra. */
export function PainelCentral({
  children,
  className,
  atraso,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** atraso da entrada coordenada (ms) */
  atraso?: number;
} & Omit<ComponentPropsWithoutRef<"section">, "className" | "children">) {
  return (
    <section
      {...rest}
      style={atraso !== undefined ? ({ "--atraso": `${atraso}ms` } as CSSProperties) : undefined}
      className={cn(
        "flex min-w-0 flex-col rounded-md border border-border bg-surface text-ink shadow-[var(--shadow-card)]",
        atraso !== undefined && "entrada",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CabecaPainel({
  icone,
  titulo,
  id,
  contagem,
  rotuloContagem,
  acao,
}: {
  icone: ReactNode;
  titulo: string;
  id: string;
  /** número em destaque ao lado do título; `null` esconde */
  contagem?: number | null;
  rotuloContagem?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-brand">{icone}</span>
        <h2 id={id} className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {titulo}
        </h2>
        {contagem !== undefined && contagem !== null && (
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-soft px-1.5 text-xs font-semibold tabular-nums text-brand"
            aria-label={rotuloContagem}
          >
            {String(contagem).padStart(2, "0")}
          </span>
        )}
      </div>
      {acao}
    </div>
  );
}

/** Vazio, indisponível: cada bloco diz o seu, sem derrubar os outros. */
export function EstadoBloco({
  titulo,
  children,
  tom = "vazio",
}: {
  titulo: string;
  children?: ReactNode;
  tom?: "vazio" | "erro";
}) {
  return (
    <div role={tom === "erro" ? "alert" : undefined} className="px-5 py-10 text-center">
      <p className={cn("text-sm font-semibold", tom === "erro" ? "text-danger" : "text-ink")}>{titulo}</p>
      {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Linhas de espera enquanto o bloco carrega (sem animação em loop). */
export function LinhasCarregando({ linhas = 3, className }: { linhas?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 px-5 py-4", className)} aria-hidden>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-sm bg-surface-2" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-2/5 rounded bg-surface-2" />
            <span className="h-3 w-4/5 rounded bg-surface-2" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function PainelCarregando({
  icone,
  titulo,
  id,
  className,
}: {
  icone: ReactNode;
  titulo: string;
  id: string;
  className?: string;
}) {
  return (
    <PainelCentral aria-labelledby={id} aria-busy="true" className={className}>
      <CabecaPainel icone={icone} titulo={titulo} id={id} />
      <p className="sr-only">Carregando…</p>
      <LinhasCarregando />
    </PainelCentral>
  );
}
