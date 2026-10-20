"use client";

import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";
import { migalhas } from "@/lib/navegacao";

/**
 * Cabeçalho global: abre o menu no celular, diz onde a pessoa está e traz o
 * sino. Orienta — o título principal (h1) continua sendo da página.
 *
 * Fundo quase opaco de propósito: `backdrop-filter` vira containing block de
 * `position: fixed` e prenderia o painel do sino dentro do cabeçalho.
 *
 * À direita, a conta de quem está logado (leva a Minha conta) — a mesma
 * página do menu, só que à vista.
 */
export function CabecalhoApp({
  pathname,
  menuAberto,
  onAbrirMenu,
  mostrarSino,
  nome,
}: {
  pathname: string;
  menuAberto: boolean;
  onAbrirMenu: () => void;
  mostrarSino: boolean;
  nome: string;
}) {
  const trilha = migalhas(pathname);
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg pt-[var(--safe-t)]">
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
            <ol className="meta-mono flex min-w-0 items-center gap-2 text-[0.75rem]">
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
                      <Link href={m.href} className="truncate text-muted transition-[color] duration-150 hover:text-ink">
                        {m.rotulo}
                      </Link>
                    ) : (
                      <span aria-current="page" className="truncate text-ink">
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

        <Link
          href="/perfil"
          aria-label={`Minha conta — ${nome}`}
          aria-current={pathname === "/perfil" ? "page" : undefined}
          className="flex min-h-10 shrink-0 items-center gap-2.5 px-1.5 text-sm text-muted transition-[background-color,color] duration-150 hover:bg-surface-2 hover:text-ink"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center border border-border-strong font-display text-sm font-semibold text-ink"
          >
            {iniciais || "?"}
          </span>
          <span className="hidden max-w-[12rem] truncate md:block">{nome}</span>
        </Link>
      </div>
    </header>
  );
}
