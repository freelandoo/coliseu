"use client";

import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";
import { migalhas } from "@/lib/navegacao";

/**
 * Cabeçalho global: abre o menu no celular, diz onde a pessoa está e traz o
 * sino. Orienta — o título principal (h1) continua sendo da página.
 *
 * Fundo sólido de propósito: `backdrop-filter` vira containing block de
 * `position: fixed` e prenderia o painel do sino dentro do cabeçalho.
 */
export function CabecalhoApp({
  pathname,
  menuAberto,
  onAbrirMenu,
  mostrarSino,
}: {
  pathname: string;
  menuAberto: boolean;
  onAbrirMenu: () => void;
  mostrarSino: boolean;
}) {
  const trilha = migalhas(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[var(--safe-t)]">
      <div className="flex h-[var(--altura-topo)] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          aria-expanded={menuAberto}
          aria-controls="menu-principal"
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-2 lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {trilha.length > 0 && (
          <nav aria-label="Localização" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              {trilha.map((m, i) => {
                const ultima = i === trilha.length - 1;
                return (
                  <li
                    key={`${m.rotulo}-${i}`}
                    // no celular ficam o módulo e o fim da trilha; o meio só a partir de `sm`
                    className={
                      ultima || i === 0
                        ? "flex min-w-0 items-center gap-1.5"
                        : "hidden min-w-0 shrink-0 items-center gap-1.5 sm:flex"
                    }
                  >
                    {i > 0 && (
                      <span aria-hidden className="text-faint">
                        /
                      </span>
                    )}
                    {m.href && !ultima ? (
                      <Link href={m.href} className="truncate text-muted transition-colors hover:text-ink">
                        {m.rotulo}
                      </Link>
                    ) : (
                      <span aria-current="page" className="truncate font-semibold text-ink">
                        {m.rotulo}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {trilha.length === 0 && <span className="flex-1" />}

        {mostrarSino && <NotificationBell />}
      </div>
    </header>
  );
}
