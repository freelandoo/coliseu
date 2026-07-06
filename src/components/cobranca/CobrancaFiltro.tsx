"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export type CategoriaCobranca = "atrasada" | "avencer" | "arenovar";

export interface LinhaCobranca {
  id: string;
  nome: string;
  telefone: string;
  detalhe: string; // "R$ 129,90 · vence 23/06/2026" ou "Mensal · expira em 3d"
  categoria: CategoriaCobranca;
  dias: number; // significado depende da categoria (ver situacao())
}

type Filtro = "todos" | CategoriaCobranca;

const CHIPS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "atrasada", label: "Atrasadas" },
  { key: "avencer", label: "A vencer" },
  { key: "arenovar", label: "A renovar" },
];

function situacao(l: LinhaCobranca): {
  rotulo: string;
  tone: "neutral" | "warn" | "red";
} {
  if (l.categoria === "atrasada")
    return { rotulo: `Atrasado ${l.dias}d`, tone: "red" };
  if (l.categoria === "arenovar")
    return { rotulo: `Expira em ${l.dias}d`, tone: "warn" };
  // a vencer
  if (l.dias <= 0) return { rotulo: "Vence hoje", tone: "warn" };
  return { rotulo: `Em ${l.dias}d`, tone: l.dias <= 3 ? "warn" : "neutral" };
}

export function CobrancaFiltro({ linhas }: { linhas: LinhaCobranca[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      todos: linhas.length,
      atrasada: linhas.filter((l) => l.categoria === "atrasada").length,
      avencer: linhas.filter((l) => l.categoria === "avencer").length,
      arenovar: linhas.filter((l) => l.categoria === "arenovar").length,
    };
    return c;
  }, [linhas]);

  const visiveis = useMemo(
    () => (filtro === "todos" ? linhas : linhas.filter((l) => l.categoria === filtro)),
    [filtro, linhas],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* filtros */}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button
              key={chip.key}
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
            Nada nesta categoria.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Aluno</Th>
                  <Th>Detalhe</Th>
                  <Th>Situação</Th>
                  <Th className="text-right">Ação</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const s = situacao(l);
                  const fone = l.telefone.replace(/\D/g, "");
                  const acao =
                    l.categoria === "arenovar" ? "Oferecer renovação" : "Cobrar";
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 font-medium text-ink">{l.nome}</td>
                      <td className="px-4 py-3 text-muted">{l.detalhe}</td>
                      <td className="px-4 py-3">
                        <Badge tone={s.tone}>{s.rotulo}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`https://wa.me/55${fone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-red-bright hover:underline"
                        >
                          {acao} →
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
