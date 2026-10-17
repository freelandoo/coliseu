import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Botões da fundação visual.
 *
 * - `primario`: a ação principal da tela/diálogo (uma por bloco).
 * - `contorno`: ação de marca secundária (ex.: "Venda de balcão").
 * - `secundario`: alternativa neutra (Cancelar, Fechar, filtros).
 * - `discreto`: ação de baixa ênfase, sem moldura.
 * - `perigo` / `perigo-contorno`: excluir, remover, desfazer.
 *
 * `classeBotao` serve para `<a>`/`<Link>` com cara de botão: link continua link.
 * As classes de tamanho e variante não definem largura nem margem — isso vem do
 * `className` do consumidor, para não haver classes conflitantes no `cn`.
 */
export type VarianteBotao =
  | "primario"
  | "contorno"
  | "secundario"
  | "discreto"
  | "perigo"
  | "perigo-contorno";

export type TamanhoBotao = "sm" | "md" | "lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-lg text-center font-semibold " +
  "transition-colors duration-150 ease-padrao " +
  "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

const VARIANTE: Record<VarianteBotao, string> = {
  primario: "bg-brand text-white hover:bg-brand-hover active:bg-brand-strong disabled:hover:bg-brand",
  contorno:
    "border border-brand/60 bg-surface text-destaque hover:bg-brand-soft disabled:hover:bg-surface",
  secundario:
    "border border-border-strong bg-surface text-ink hover:border-control hover:bg-surface-2 disabled:hover:bg-surface",
  discreto: "text-muted hover:bg-surface-2 hover:text-ink disabled:hover:bg-transparent",
  perigo: "bg-danger text-white hover:bg-danger-strong disabled:hover:bg-danger",
  "perigo-contorno":
    "border border-danger/50 bg-surface text-danger hover:bg-danger-soft disabled:hover:bg-surface",
};

const TAMANHO: Record<TamanhoBotao, string> = {
  sm: "min-h-8 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-sm",
};

export function classeBotao({
  variante = "secundario",
  tamanho = "md",
  bloco = false,
}: { variante?: VarianteBotao; tamanho?: TamanhoBotao; bloco?: boolean } = {}): string {
  return cn(BASE, VARIANTE[variante], TAMANHO[tamanho], bloco && "w-full");
}

/**
 * `type="button"` por padrão: submit só quando o consumidor pede.
 * `carregando` marca `aria-busy` e desabilita — use apenas onde o botão já era
 * desabilitado durante o processamento, para não mudar a regra de envio.
 * O texto de carregamento continua com o consumidor ("Salvando…").
 */
export function Botao({
  variante,
  tamanho,
  bloco,
  carregando = false,
  type = "button",
  disabled,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"button"> & {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  bloco?: boolean;
  carregando?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(classeBotao({ variante, tamanho, bloco }), className)}
      {...rest}
    >
      {carregando && <Girando />}
      {children}
    </button>
  );
}

function Girando() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
