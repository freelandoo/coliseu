"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ABAS: { href: string; label: string }[] = [
  { href: "/matriculados", label: "Matriculados" },
  { href: "/matriculados/retencao", label: "Retenção" },
  { href: "/matriculados/fidelidade", label: "Fidelidade" },
];

export function MatriculadosTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
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
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              ativo
                ? "border-red/60 bg-red-ghost text-ink"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            <span className="uppercase tracking-wide">{aba.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
