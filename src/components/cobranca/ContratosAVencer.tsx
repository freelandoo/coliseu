"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatData } from "@/lib/mock-data";
import { CARENCIA_DIAS } from "@/lib/billing/regua";
import { useCascata } from "@/lib/useCascata";

/** Duração do contrato, pela duração do plano. */
export type Duracao = "anual" | "semestral" | "trimestral" | "mensal" | "outro";

export interface ContratoAVencer {
  pessoaId: string;
  nome: string;
  codigo: string;
  telefone: string;
  plano: string;
  duracao: Duracao;
  inicio: string; // ISO
  vencimento: string; // ISO
  /** Dias até o vencimento (0 = vence hoje). */
  dias: number;
}

type Filtro = "longos" | Duracao | "todos";

const ROTULO_DURACAO: Record<Duracao, string> = {
  anual: "Anual",
  semestral: "Semestral",
  trimestral: "Trimestral",
  mensal: "Mensal",
  outro: "Outro",
};

/**
 * "Mais de 1 mês" vem marcado: o mensal vence todo mês e encobriria os anuais e
 * semestrais, que são os contratos que pedem conversa de renovação.
 */
const CHIPS: { key: Filtro; label: string }[] = [
  { key: "longos", label: "Mais de 1 mês" },
  { key: "anual", label: "Anuais" },
  { key: "semestral", label: "Semestrais" },
  { key: "trimestral", label: "Trimestrais" },
  { key: "mensal", label: "Mensais" },
  { key: "todos", label: "Todos" },
];

function combina(c: ContratoAVencer, f: Filtro): boolean {
  if (f === "todos") return true;
  if (f === "longos") return c.duracao !== "mensal";
  return c.duracao === f;
}

function prazo(dias: number): { rotulo: string; tone: "neutral" | "warn" | "danger" } {
  if (dias <= 0) return { rotulo: "Vence hoje", tone: "danger" };
  if (dias <= 7) return { rotulo: `Em ${dias}d`, tone: "danger" };
  if (dias <= 15) return { rotulo: `Em ${dias}d`, tone: "warn" };
  return { rotulo: `Em ${dias}d`, tone: "neutral" };
}

function Contato({ c }: { c: ContratoAVencer }) {
  const fone = c.telefone.replace(/\D/g, "");
  if (!fone) return <span className="text-xs text-muted">sem telefone</span>;
  return (
    <a
      href={`https://wa.me/55${fone}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-medium text-destaque hover:underline"
    >
      Oferecer renovação →
    </a>
  );
}

/** Contratos ativos que vencem nos próximos 30 dias, do mais próximo ao mais distante. */
export function ContratosAVencer({ contratos }: { contratos: ContratoAVencer[] }) {
  const cascata = useCascata();
  const [filtro, setFiltro] = useState<Filtro>("longos");

  const contagem = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const chip of CHIPS) c[chip.key] = contratos.filter((x) => combina(x, chip.key)).length;
    return c;
  }, [contratos]);
  const visiveis = contratos.filter((c) => combina(c, filtro));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Contratos ativos que vencem nos próximos 30 dias. Converse sobre a renovação antes do vencimento: depois
        dele são {CARENCIA_DIAS} dias de carência e a catraca bloqueia.
      </p>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button
              type="button"
              key={chip.key}
              onClick={() => setFiltro(chip.key)}
              aria-pressed={ativo}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm",
                ativo
                  ? "border-brand/60 bg-brand-soft text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span>{chip.label}</span>
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-xs font-semibold sm:h-5 sm:min-w-5",
                  ativo ? "bg-brand text-white" : "bg-surface-2 text-faint",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="mx-auto max-w-md px-5 py-10 text-center text-sm text-muted">
            Nenhum contrato {filtro === "todos" || filtro === "longos" ? "" : `${ROTULO_DURACAO[filtro as Duracao].toLowerCase()} `}
            vence nos próximos 30 dias.
          </p>
        ) : (
          <>
            {/* mobile: cards empilhados */}
            <div className="divide-y divide-border sm:hidden">
              {visiveis.map((c) => {
                const p = prazo(c.dias);
                return (
                  <div key={c.pessoaId} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/matriculados/${c.pessoaId}`}
                          className="block truncate text-sm font-medium text-ink underline-offset-2 hover:text-destaque hover:underline"
                        >
                          {c.nome}
                        </Link>
                        <p className="text-xs text-muted">
                          {ROTULO_DURACAO[c.duracao]} · {c.plano}
                        </p>
                        <p className="text-xs text-faint">
                          {formatData(c.inicio)} → {formatData(c.vencimento)}
                        </p>
                      </div>
                      <Badge tone={p.tone}>{p.rotulo}</Badge>
                    </div>
                    <div className="text-right">
                      <Contato c={c} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* desktop: tabela */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Aluno</Th>
                    <Th>Contrato</Th>
                    <Th>Início</Th>
                    <Th>Vencimento</Th>
                    <Th>Prazo</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody className={cascata}>
                  {visiveis.map((c) => {
                    const p = prazo(c.dias);
                    return (
                      <tr key={c.pessoaId} className="border-b border-border last:border-0 transition-colors hover:bg-surface-2">
                        <td className="px-4 py-3 font-medium text-ink">
                          <Link href={`/matriculados/${c.pessoaId}`} className="underline-offset-2 hover:text-destaque hover:underline">
                            {c.nome}
                          </Link>
                          <span className="ml-2 font-mono text-xs font-normal text-faint">{c.codigo}</span>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          <span className="text-ink">{ROTULO_DURACAO[c.duracao]}</span> · {c.plano}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted">{formatData(c.inicio)}</td>
                        <td className="px-4 py-3 tabular-nums text-ink">{formatData(c.vencimento)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={p.tone}>{p.rotulo}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Contato c={c} />
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3 text-xs font-semibold text-faint", className)}>{children}</th>
  );
}
