import type { ComponentPropsWithoutRef, ReactNode } from "react";
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
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-faint">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-4xl font-semibold leading-none",
          tone === "red" && "text-red-bright",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </Card>
  );
}

/* ---------- Cabeçalho de página ---------- */
export function PageHeader({
  step,
  title,
  subtitle,
}: {
  step?: number;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-8 flex items-start gap-4">
      <span className="steel-plate mt-1 h-10 w-10 shrink-0 rounded-md text-xl">
        {step ?? "•"}
      </span>
      <div>
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-ink">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
      </div>
    </header>
  );
}
