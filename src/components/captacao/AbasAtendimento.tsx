import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type AbaAtendimento = "conversas" | "uso";

const ABAS: { chave: AbaAtendimento; label: string; href: string }[] = [
  { chave: "conversas", label: "Conversas", href: "/atendimento" },
  { chave: "uso", label: "Uso", href: "/atendimento/uso" },
];

/**
 * Cabeçalho do Atendimento: o título, as abas e o que a tela quiser à direita
 * (na de conversas, o estado da conexão do WhatsApp).
 *
 * As abas são links de rota, não estado de tela: cada uma carrega dados
 * próprios do servidor, e a de uso não devia ficar remontando o inbox inteiro
 * atrás dela. O endereço também vira coisa que se manda para alguém.
 *
 * Sem permissão para a aba de uso, o cabeçalho volta a ser só o título — quem
 * não vê o quadro não precisa saber que ele existe.
 */
export function AbasAtendimento({
  ativa,
  podeVerUso,
  acao,
}: {
  ativa: AbaAtendimento;
  podeVerUso: boolean;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
          Atendimento
        </h1>
        {podeVerUso && (
          <nav
            aria-label="Seções do atendimento"
            className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
          >
            {ABAS.map((a) => (
              <Link
                key={a.chave}
                href={a.href}
                aria-current={a.chave === ativa ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-widest transition-colors",
                  a.chave === ativa
                    ? "bg-red-ghost text-ink"
                    : "text-faint hover:text-muted",
                )}
              >
                {a.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {acao}
    </div>
  );
}
