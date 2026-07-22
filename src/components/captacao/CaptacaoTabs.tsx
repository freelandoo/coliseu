"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ABAS = [
  { href: "/captacao", label: "Leads" },
  { href: "/captacao/atendimento", label: "Atendimento" },
];

/** Navegação entre o funil de leads e o inbox do WhatsApp. */
export function CaptacaoTabs({ naoLidas = 0 }: { naoLidas?: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2">
      {ABAS.map((aba) => {
        const ativo = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              ativo
                ? "border-red/60 bg-red-ghost text-ink"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            <span className="uppercase tracking-wide">{aba.label}</span>
            {aba.href === "/captacao/atendimento" && naoLidas > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-red px-1 text-xs font-semibold text-white">
                {naoLidas}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
