import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/* ---------- Card ---------- */
export function Card({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface",
        "shadow-[var(--shadow-card)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------- Tons semânticos ---------- */
/**
 * `brand` = identidade/destaque (rubi); `danger` = erro, atraso, risco, falha.
 * `ok` e `warn` são aliases legados de `success` e `warning` (mesmo visual).
 */
export type Tone = "neutral" | "brand" | "danger" | "success" | "warning" | "info" | "ok" | "warn";

const TONE_BADGE: Record<Tone, string> = {
  neutral: "border-border-strong/70 text-muted bg-surface-2",
  brand: "border-brand/30 text-destaque bg-brand-soft",
  danger: "border-danger/30 text-danger bg-danger-soft",
  success: "border-success/30 text-success bg-success-soft",
  ok: "border-success/30 text-success bg-success-soft",
  warning: "border-warning/30 text-warning bg-warning-soft",
  warn: "border-warning/30 text-warning bg-warning-soft",
  info: "border-info/30 text-info bg-info-soft",
};

const TONE_TEXTO: Record<Tone, string> = {
  neutral: "text-ink",
  brand: "text-destaque",
  danger: "text-danger",
  success: "text-success",
  ok: "text-success",
  warning: "text-warning",
  warn: "text-warning",
  info: "text-info",
};

/* ---------- Badge ---------- */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5",
        "text-xs font-medium",
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Stat ---------- */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  /** Quando presente, o tile inteiro vira link para a tela daquele dado. */
  href?: string;
}) {
  const conteudo = (
    <>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-display text-3xl font-semibold leading-none tabular-nums",
          TONE_TEXTO[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="group block rounded-2xl">
        <Card className="h-full p-4 transition-colors duration-150 group-hover:border-border-strong group-hover:bg-surface-2">
          {conteudo}
        </Card>
      </Link>
    );
  }

  return <Card className="p-4">{conteudo}</Card>;
}

/* ---------- Cabeçalho de página ---------- */
export function PageHeader({
  step,
  title,
  subtitle,
}: {
  step?: number;
  title: string;
  /** Descrição opcional e enxuta; a maioria das telas dispensa. */
  subtitle?: string;
}) {
  return (
    <header className="mb-5 flex items-center gap-3">
      <span
        aria-hidden
        className="steel-plate h-8 w-8 shrink-0 rounded-lg text-sm sm:h-9 sm:w-9 sm:text-base"
      >
        {step ?? "•"}
      </span>
      <div>
        <h1 className="font-display text-xl font-semibold tracking-wide text-ink sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}
