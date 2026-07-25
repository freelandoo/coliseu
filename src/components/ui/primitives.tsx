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
        "rounded-xl border border-border bg-surface",
        "shadow-[var(--shadow-plate)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------- Badge ---------- */
type Tone = "neutral" | "red" | "ok" | "warn";

const TONE: Record<Tone, string> = {
  neutral: "border-border text-muted bg-surface-2",
  red: "border-red/40 text-red-bright bg-red-ghost",
  ok: "border-ok/40 text-ok bg-ok/10",
  warn: "border-warn/40 text-warn bg-warn/10",
};

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
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5",
        "text-xs font-medium uppercase tracking-wide",
        TONE[tone],
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
      <p className="text-[11px] font-medium uppercase tracking-widest text-faint">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-3xl font-semibold leading-none",
          tone === "red" && "text-red-bright",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="group block">
        <Card className="h-full p-4 transition-colors group-hover:border-border-strong group-hover:bg-surface-2">
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
    <header className="mb-4 flex items-center gap-3">
      <span className="steel-plate h-8 w-8 shrink-0 rounded-md text-base">
        {step ?? "•"}
      </span>
      <div>
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-xs text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}
