"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface LinhaRetencao {
  id: string;
  nome: string;
  telefone: string;
  planoNome: string;
  ultimaPresenca: string; // já formatada (dd/mm/aaaa)
  dias: number;
  faixa: 7 | 14 | 21 | null; // null = frequente (presença em dia)
}

type Filtro = "todos" | "frequente" | 7 | 14 | 21;

const CHIPS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "frequente", label: "Frequentes" },
  { key: 7, label: "7 dias" },
  { key: 14, label: "14 dias" },
  { key: 21, label: "21 dias" },
];

const FAIXA_INFO: Record<
  "frequente" | "7" | "14" | "21",
  { rotulo: string; tone: "ok" | "warn" | "red" }
> = {
  frequente: { rotulo: "Em dia", tone: "ok" },
  "7": { rotulo: "Acompanhamento", tone: "warn" },
  "14": { rotulo: "Alerta de risco", tone: "red" },
  "21": { rotulo: "Reativação", tone: "red" },
};

function infoDe(faixa: LinhaRetencao["faixa"]) {
  return FAIXA_INFO[faixa === null ? "frequente" : (String(faixa) as "7" | "14" | "21")];
}

export function RetencaoFiltro({ linhas }: { linhas: LinhaRetencao[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      todos: linhas.length,
      frequente: linhas.filter((l) => l.faixa === null).length,
      7: linhas.filter((l) => l.faixa === 7).length,
      14: linhas.filter((l) => l.faixa === 14).length,
      21: linhas.filter((l) => l.faixa === 21).length,
    };
    return c;
  }, [linhas]);

  const visiveis = useMemo(() => {
    if (filtro === "todos") return linhas;
    if (filtro === "frequente") return linhas.filter((l) => l.faixa === null);
    return linhas.filter((l) => l.faixa === filtro);
  }, [filtro, linhas]);

  return (
    <div className="flex flex-col gap-5">
      {/* filtros */}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button
              key={String(chip.key)}
              onClick={() => setFiltro(chip.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm",
                ativo
                  ? "border-red/60 bg-red-ghost text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span className="uppercase tracking-wide">{chip.label}</span>
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[10px] font-semibold sm:h-5 sm:min-w-5 sm:text-xs",
                  ativo ? "bg-red text-white" : "bg-surface-2 text-faint",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* tabela */}
      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">
            Ninguém nesta categoria.
          </p>
        ) : (
          <>
          {/* mobile: cards empilhados, sem scroll horizontal */}
          <div className="divide-y divide-border sm:hidden">
            {visiveis.map((l) => {
              const info = infoDe(l.faixa);
              const fone = l.telefone.replace(/\D/g, "");
              return (
                <div key={l.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{l.nome}</p>
                    <p className="text-xs text-muted">
                      {l.planoNome} · última presença {l.ultimaPresenca} (
                      <span
                        className={cn(
                          "font-semibold",
                          l.faixa === null ? "text-ok" : "text-red-bright",
                        )}
                      >
                        {l.dias}d
                      </span>
                      )
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <Badge tone={info.tone}>{info.rotulo}</Badge>
                    <a
                      href={`https://wa.me/55${fone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs font-medium text-red-bright hover:underline"
                    >
                      WhatsApp →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* desktop: tabela */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Aluno</Th>
                  <Th>Plano</Th>
                  <Th>Última presença</Th>
                  <Th>Ausência</Th>
                  <Th>Ação sugerida</Th>
                  <Th className="text-right">Contato</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const info = infoDe(l.faixa);
                  const fone = l.telefone.replace(/\D/g, "");
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 font-medium text-ink">{l.nome}</td>
                      <td className="px-4 py-3 text-muted">{l.planoNome}</td>
                      <td className="px-4 py-3 text-faint">{l.ultimaPresenca}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            l.faixa === null ? "text-ok" : "text-red-bright",
                          )}
                        >
                          {l.dias}d
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={info.tone}>{info.rotulo}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`https://wa.me/55${fone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-red-bright hover:underline"
                        >
                          WhatsApp →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}
