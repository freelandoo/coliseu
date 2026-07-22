"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { podeModulo, type Modulo, type Papel } from "@/lib/auth/modulos";

const IconBarras = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <rect x="1" y="7.5" width="3" height="5.5" rx="1" fill="currentColor" />
    <rect x="5.5" y="4" width="3" height="9" rx="1" fill="currentColor" />
    <rect x="10" y="1.5" width="3" height="11.5" rx="1" fill="currentColor" />
  </svg>
);

const IconPessoas = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <circle cx="7.5" cy="5" r="2.4" fill="currentColor" />
    <path d="M2.5 13c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" fill="currentColor" />
  </svg>
);

const IconCustos = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M7.5 4.3v6.4M6 9.2c0 .8.7 1.2 1.5 1.2s1.5-.4 1.5-1.2-.7-1-1.5-1.2S6 6.6 6 5.8s.7-1.2 1.5-1.2 1.5.4 1.5 1.2"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
    />
  </svg>
);

const IconAcesso = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
    <rect x="2" y="1.5" width="11" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 1.5v12M10 1.5v12" stroke="currentColor" strokeWidth="1.1" />
    <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" />
  </svg>
);

const NAV: {
  href: string;
  modulo: Modulo;
  step?: number;
  icon?: ReactNode;
  label: string;
  hint: string;
}[] = [
  { href: "/painel", modulo: "painel", label: "Painel", hint: "Visão geral" },
  { href: "/matriculados", modulo: "matriculados", icon: IconPessoas, label: "Matriculados", hint: "Alunos, renovação, retenção e fidelidade" },
  { href: "/captacao", modulo: "captacao", step: 1, label: "Captação", hint: "Leads e atendimento" },
  { href: "/cobranca", modulo: "cobranca", step: 3, label: "Cobrança", hint: "Renovação e inadimplência" },
  { href: "/custos", modulo: "custos", icon: IconCustos, label: "Custos", hint: "Despesas e lucro" },
  { href: "/acesso", modulo: "acesso", icon: IconAcesso, label: "Acesso", hint: "Catracas e credenciais" },
  { href: "/relatorios", modulo: "relatorios", icon: IconBarras, label: "Relatórios", hint: "Indicadores do negócio" },
];

export function Sidebar({ papel }: { papel: Papel }) {
  const pathname = usePathname();
  // O menu mostra só o que o papel abre — o guard de cada página é quem
  // realmente barra o acesso; aqui é para não oferecer porta fechada.
  const itens = NAV.filter((item) => podeModulo(papel, item.modulo));
  const [aberto, setAberto] = useState(false);
  // O drawer fecha ao clicar num link, no backdrop ou no X (mobile).

  return (
    <>
      {/* botão abrir (só mobile) */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface/90 text-ink backdrop-blur transition-colors hover:bg-surface-2 lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {/* backdrop (só mobile, quando aberto) */}
      {aberto && (
        <div
          onClick={() => setAberto(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/95 backdrop-blur transition-transform duration-300",
          "lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:bg-surface/60",
          aberto ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="relative flex items-center gap-3 border-b border-border px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="steel-plate h-9 w-9 rounded-md text-sm">CT</span>
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold uppercase tracking-wide text-ink">
                Coliseu CRM
              </span>
              <span className="block text-[11px] uppercase tracking-widest text-faint">
                Academia Coliseu Team
              </span>
            </span>
          </Link>

          {/* botão fechar (só mobile) */}
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {itens.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setAberto(false)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  active
                    ? "bg-red-ghost text-ink"
                    : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r bg-red-bright [width:3px]" />
                )}
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                    active
                      ? "border-red/50 bg-red text-white"
                      : "border-border bg-surface text-faint group-hover:text-muted",
                  )}
                >
                  {item.icon ?? item.step ?? "•"}
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-[11px] text-faint">{item.hint}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <Link
            href="/perfil"
            onClick={() => setAberto(false)}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
              pathname === "/perfil"
                ? "bg-red-ghost text-ink"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {pathname === "/perfil" && (
              <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r bg-red-bright [width:3px]" />
            )}
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                pathname === "/perfil"
                  ? "border-red/50 bg-red text-white"
                  : "border-border bg-surface text-faint group-hover:text-muted",
              )}
            >
              {IconPessoas}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-medium">Perfil</span>
              <span className="block text-[11px] text-faint">Conta, senha e downloads</span>
            </span>
          </Link>
        </div>

        <div className="border-t border-border px-5 py-4 text-[11px] text-faint">
          <p className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
            Integração Asaas + WhatsApp
          </p>
          <p className="mt-1">v0.1 · dados de demonstração</p>
        </div>
      </aside>
    </>
  );
}
