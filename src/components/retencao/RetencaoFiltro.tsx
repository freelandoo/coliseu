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
                "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                ativo
                  ? "border-red/60 bg-red-ghost text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span className="uppercase tracking-wide">{chip.label}</span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold",
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
          <div className="overflow-x-auto">
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
