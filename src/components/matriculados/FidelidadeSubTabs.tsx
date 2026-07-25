"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const SUB: { href: string; label: string }[] = [
  { href: "/matriculados/fidelidade", label: "Tempo de casa" },
  { href: "/matriculados/fidelidade/indicadores", label: "Indicadores" },
];

export function FidelidadeSubTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1">
      {SUB.map((s) => {
        const ativo = pathname === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              ativo ? "bg-red text-white" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
