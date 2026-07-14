"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ABAS: { href: string; label: string; hint: string }[] = [
  { href: "/matriculados", label: "Matriculados", hint: "Alunos ativos" },
  { href: "/matriculados/retencao", label: "Retenção", hint: "Presença e reativação" },
  { href: "/matriculados/fidelidade", label: "Fidelidade", hint: "Tempo de casa" },
];

export function MatriculadosTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-8 flex flex-wrap gap-2 border-b border-border pb-4">
      {ABAS.map((aba) => {
        // A aba raiz (/matriculados) só acende no match exato; as demais acendem em subrotas.
        const ativo =
          aba.href === "/matriculados"
            ? pathname === aba.href
            : pathname === aba.href || pathname.startsWith(aba.href + "/");
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={cn(
              "group flex flex-col rounded-lg border px-4 py-2.5 transition-colors",
              ativo
                ? "border-red/60 bg-red-ghost text-ink"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            <span className="font-display text-sm font-semibold uppercase tracking-wide">
              {aba.label}
            </span>
            <span className="text-[11px] text-faint">{aba.hint}</span>
          </Link>
        );
      })}
    </div>
  );
}
