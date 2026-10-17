"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NaoLidasBadge } from "@/components/NaoLidasBadge";
import { useCamada } from "@/components/ui/camada";
import type { Papel } from "@/lib/auth/modulos";
import { destinoAtivo, gruposVisiveis, type DestinoNav, type IconeNav } from "@/lib/navegacao";

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ICONES: Record<IconeNav, ReactNode> = {
  chat: (
    <Icone>
      <path d="M15.5 8.6c0 3.4-2.9 6-6.5 6-.8 0-1.5-.1-2.1-.3L3 15.5l1-3C3.1 11.4 2.5 10 2.5 8.6c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6z" />
    </Icone>
  ),
  funil: (
    <Icone>
      <path d="M2.5 3h13l-5 6.2v4.6l-3 1.7V9.2z" />
    </Icone>
  ),
  calendario: (
    <Icone>
      <rect x="2.5" y="3.5" width="13" height="12" rx="1.6" />
      <path d="M2.5 7.3h13M6 2v3M12 2v3" />
    </Icone>
  ),
  painel: (
    <Icone>
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="10" width="5.5" height="5.5" rx="1.2" />
    </Icone>
  ),
  pessoas: (
    <Icone>
      <circle cx="7" cy="6" r="2.6" />
      <path d="M2.5 15c0-2.6 2-4.4 4.5-4.4s4.5 1.8 4.5 4.4" />
      <path d="M12 3.6a2.5 2.5 0 010 4.8M13.5 10.9c1.3.6 2 1.9 2 3.6" />
    </Icone>
  ),
  cobranca: (
    <Icone>
      <rect x="2" y="4" width="14" height="10" rx="1.6" />
      <path d="M2 7.5h14M5 11h3" />
    </Icone>
  ),
  despesas: (
    <Icone>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5.5v7M7.3 10.9c0 .8.8 1.3 1.7 1.3s1.7-.5 1.7-1.3-.8-1.1-1.7-1.3-1.7-.5-1.7-1.3.8-1.3 1.7-1.3 1.7.5 1.7 1.3" />
    </Icone>
  ),
  relatorios: (
    <Icone>
      <path d="M3 15.5V9.5M7 15.5V5.5M11 15.5V8M15 15.5V3" />
    </Icone>
  ),
  acesso: (
    <Icone>
      <rect x="3" y="2" width="12" height="14" rx="1.6" />
      <path d="M6.5 2v14M11.5 2v14" />
    </Icone>
  ),
  conta: (
    <Icone>
      <circle cx="9" cy="6.5" r="3" />
      <path d="M3.5 15.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </Icone>
  ),
  backup: (
    <Icone>
      <path d="M3.5 5h11l-1 10a1.2 1.2 0 01-1.2 1H5.7a1.2 1.2 0 01-1.2-1z" />
      <path d="M2 5h14M7 2.5h4" />
    </Icone>
  ),
};

/**
 * Menu principal. No desktop é a coluna fixa à esquerda; no celular, a mesma
 * peça vira gaveta — uma instância só (o contador de não lidas não duplica).
 *
 * Fechada no celular, a gaveta fica `invisible`: sai do Tab e do leitor de tela
 * sem depender de JavaScript. Aberta, usa a mesma camada dos diálogos (foco
 * preso, fundo inerte, rolagem travada, Esc fecha, foco volta ao botão).
 */
export function Sidebar({
  papel,
  desenvolvedor,
  pathname,
  aberta,
  onFechar,
}: {
  papel: Papel;
  desenvolvedor: boolean;
  pathname: string;
  aberta: boolean;
  onFechar: () => void;
}) {
  const grupos = gruposVisiveis(papel, desenvolvedor);
  const ativo = destinoAtivo(pathname);
  const principais = grupos.filter((g) => g.id !== "conta");
  const conta = grupos.find((g) => g.id === "conta");

  const raizRef = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLElement>(null);
  useCamada({ ativa: aberta, raizRef, focoRef: painelRef, onEsc: onFechar });

  const item = (d: DestinoNav) => {
    const atual = ativo?.href === d.href;
    return (
      <li key={d.href}>
        <Link
          href={d.href}
          onClick={onFechar}
          aria-current={atual ? "page" : undefined}
          className={cn(
            "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            atual ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          {atual && (
            <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-brand" />
          )}
          <span className={cn("shrink-0", atual ? "text-brand" : "text-faint")}>{ICONES[d.icone]}</span>
          <span className="min-w-0 flex-1 truncate">{d.rotulo}</span>
          {/* Não lidas do WhatsApp — só no Atendimento, some quando zera. */}
          {d.modulo === "atendimento" && <NaoLidasBadge />}
        </Link>
      </li>
    );
  };

  return (
    // `contents`: no desktop o wrapper não existe para o layout; na gaveta ele
    // é a raiz da camada (véu + painel continuam interativos, o resto fica inerte).
    <div ref={raizRef} className="contents">
      {aberta && <div onClick={onFechar} aria-hidden className="fixed inset-0 z-40 bg-scrim lg:hidden" />}

      <aside
        ref={painelRef}
        id="menu-principal"
        aria-label="Menu principal"
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col border-r border-border bg-surface outline-none",
          // de ponta a ponta: o topo não nasce sob o relógio nem o rodapé some na barra de gestos
          "pt-[var(--safe-t)] pb-[var(--safe-b)]",
          "transition-[transform,visibility] duration-200 ease-padrao motion-reduce:transition-none",
          "lg:visible lg:sticky lg:top-0 lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0",
          aberta ? "visible translate-x-0 shadow-[var(--shadow-overlay)]" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-[var(--altura-topo)] shrink-0 items-center gap-3 border-b border-border px-4">
          <Link href="/" onClick={onFechar} className="flex min-w-0 flex-1 items-center gap-3 rounded-md">
            <span className="steel-plate h-8 w-8 shrink-0 rounded-md text-sm">CT</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-base font-semibold uppercase tracking-wide text-ink">
                Coliseu CRM
              </span>
              <span className="block truncate text-[11px] uppercase tracking-widest text-faint">
                Academia Coliseu Team
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onFechar}
            data-autofocus
            aria-label="Fechar menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* só os links rolam: topo e conta ficam sempre alcançáveis */}
        <nav aria-label="Módulos" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {principais.map((g) => (
            <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="mb-4 last:mb-0">
              <h2 id={`grupo-${g.id}`} className="mb-1 px-3 text-xs font-semibold text-faint">
                {g.rotulo}
              </h2>
              <ul className="flex flex-col gap-0.5">{g.itens.map(item)}</ul>
            </section>
          ))}
        </nav>

        {conta && (
          <nav aria-label={conta.rotulo} className="shrink-0 border-t border-border px-3 py-3">
            <ul className="flex flex-col gap-0.5">{conta.itens.map(item)}</ul>
          </nav>
        )}
      </aside>
    </div>
  );
}
