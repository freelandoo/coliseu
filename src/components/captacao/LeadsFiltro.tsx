"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { RemoverPessoa } from "@/components/clientes/RemoverPessoa";
import { cn } from "@/lib/cn";
import { formatData } from "@/lib/mock-data";
import {
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type Lead,
  type LeadEstagio,
} from "@/lib/types";

type Filtro = "todos" | LeadEstagio;

const ORDEM: LeadEstagio[] = [
  "novo",
  "qualificado",
  "interesse",
  "convertido",
  "perdido",
];

const TONE: Record<LeadEstagio, "neutral" | "red" | "ok" | "warn"> = {
  novo: "neutral",
  qualificado: "warn",
  interesse: "red",
  convertido: "ok",
  perdido: "neutral",
};

export function LeadsFiltro({ leads }: { leads: Lead[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const contagem = useMemo(() => {
    const c = { todos: leads.length } as Record<Filtro, number>;
    for (const e of ORDEM) c[e] = leads.filter((l) => l.estagio === e).length;
    return c;
  }, [leads]);

  const visiveis = useMemo(
    () =>
      filtro === "todos" ? leads : leads.filter((l) => l.estagio === filtro),
    [filtro, leads],
  );

  const chips: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    ...ORDEM.map((e) => ({ key: e, label: LEAD_ESTAGIO_LABEL[e] })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* filtros */}
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
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
                  ativo
                    ? "bg-red text-white"
                    : "bg-surface-2 text-faint",
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
            Nenhum lead nesta categoria.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Nome</Th>
                  <Th>Contato</Th>
                  <Th>Origem</Th>
                  <Th>Estágio</Th>
                  <Th>Entrada</Th>
                  <Th className="text-right">Ação</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((lead) => {
                  const fone = lead.telefone.replace(/\D/g, "");
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{lead.nome}</p>
                        {lead.motivoPerdido && (
                          <p className="mt-0.5 text-xs text-faint">
                            {lead.motivoPerdido}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{lead.telefone}</td>
                      <td className="px-4 py-3">
                        <Badge>{ORIGEM_LABEL[lead.origem]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={TONE[lead.estagio]}>
                          {LEAD_ESTAGIO_LABEL[lead.estagio]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-faint">
                        {formatData(lead.criadoEm)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-3">
                          <a
                            href={`https://wa.me/55${fone}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-red-bright hover:underline"
                          >
                            WhatsApp →
                          </a>
                          <RemoverPessoa id={lead.id} nome={lead.nome} />
                        </span>
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
