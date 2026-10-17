"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { secaoAtiva, type SecaoNav } from "@/lib/navegacao";

/**
 * Subnavegação entre ROTAS (cada seção é uma página). Links de verdade —
 * abrem em nova aba, entram no histórico — e não tabs: tab é para alternar
 * painéis dentro da mesma página (ver `Abas`).
 */
export function SubnavRota({
  rotulo,
  secoes,
  variante = "secoes",
}: {
  /** Nome acessível do `nav` ("Seções de Alunos"). */
  rotulo: string;
  secoes: readonly SecaoNav[];
  /** `secoes`: nível do módulo; `segmentos`: segundo nível, mais discreto. */
  variante?: "secoes" | "segmentos";
}) {
  const pathname = usePathname();
  const ativa = secaoAtiva(pathname, secoes);

  return (
    <nav
      aria-label={rotulo}
      className={cn(
        variante === "secoes"
          ? "mb-4 overflow-x-auto border-b border-border"
          : "mb-4 inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1",
      )}
    >
      <ul className="flex gap-1">
        {secoes.map((s) => {
          const atual = s.href === ativa;
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  "flex items-center whitespace-nowrap text-sm font-medium transition-colors",
                  variante === "secoes"
                    ? cn(
                        "-mb-px min-h-10 border-b-2 px-3 py-2",
                        atual
                          ? "border-destaque text-destaque"
                          : "border-transparent text-muted hover:border-border-strong hover:text-ink",
                      )
                    : cn(
                        "min-h-8 rounded-md px-3 py-1",
                        atual ? "bg-brand-soft text-destaque" : "text-muted hover:bg-surface-2 hover:text-ink",
                      ),
                )}
              >
                {s.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
