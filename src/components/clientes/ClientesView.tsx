"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { NovoCadastro } from "@/components/clientes/NovoCadastro";
import { RemoverPessoa } from "@/components/clientes/RemoverPessoa";
import { RenovarModal } from "@/components/matriculados/RenovarModal";
import { cn } from "@/lib/cn";
import {
  ALUNO_STATUS_LABEL,
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type Pessoa,
  type Plano,
} from "@/lib/types";

type Filtro = "todos" | "ativo" | "pendente" | "inadimplente" | "cancelado";

const CHIPS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ativo", label: "Ativos" },
  { key: "pendente", label: "Pendentes" },
  { key: "inadimplente", label: "Inadimplentes" },
  { key: "cancelado", label: "Cancelados" },
];

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function situacaoDe(p: Pessoa): {
  rotulo: string;
  tone: "neutral" | "ok" | "warn" | "red";
} {
  if (p.fase === "lead") {
    return {
      rotulo: LEAD_ESTAGIO_LABEL[p.estagio ?? "novo"],
      tone: p.estagio === "perdido" ? "neutral" : "warn",
    };
  }
  const tone: Record<string, "neutral" | "ok" | "warn" | "red"> = {
    ativo: "ok",
    pendente: "warn",
    inadimplente: "red",
    cancelado: "neutral",
  };
  const s = p.status ?? "ativo";
  return { rotulo: ALUNO_STATUS_LABEL[s], tone: tone[s] };
}

function combina(p: Pessoa, filtro: Filtro): boolean {
  if (filtro === "todos") return true;
  return p.fase === "aluno" && p.status === filtro;
}

export function ClientesView({
  pessoas,
  planos = [],
}: {
  pessoas: Pessoa[];
  planos?: Plano[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [renovando, setRenovando] = useState<Pessoa | null>(null);

  const planoById = useMemo(() => new Map(planos.map((p) => [p.id, p])), [planos]);

  function fecharRenovacao() {
    setRenovando(null);
    router.refresh();
  }

  const contagem = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const chip of CHIPS) c[chip.key] = pessoas.filter((p) => combina(p, chip.key)).length;
    return c;
  }, [pessoas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = soDigitos(busca);
    return pessoas.filter((p) => {
      if (!combina(p, filtro)) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        (!!p.cpf && soDigitos(p.cpf).includes(qd) && qd.length > 0) ||
        (!!p.telefone && soDigitos(p.telefone).includes(qd) && qd.length > 0)
      );
    });
  }, [pessoas, filtro, busca]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código, CPF ou telefone…"
          className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-red/60"
        />
        <NovoCadastro planos={planos} />
      </div>

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

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">
            Nenhuma pessoa nesta categoria.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Código</Th>
                  <Th>Nome</Th>
                  <Th>Contato</Th>
                  <Th>Origem</Th>
                  <Th>Situação</Th>
                  <Th>Renovação</Th>
                  <Th>Remover</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const s = situacaoDe(p);
                  const plano = p.planoId ? planoById.get(p.planoId) : undefined;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/matriculados/${p.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-faint">{p.codigo}</td>
                      <td className="px-4 py-3 font-medium text-ink">{p.nome}</td>
                      <td className="px-4 py-3 text-muted">
                        {p.telefone || p.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{ORIGEM_LABEL[p.origem]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.tone}>{s.rotulo}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {plano && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenovando(p);
                            }}
                            className="rounded-md border border-red/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-bright transition-colors hover:bg-red-ghost"
                          >
                            Renovar
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RemoverPessoa id={p.id} nome={p.nome} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {renovando && renovando.planoId && planoById.get(renovando.planoId) && (
        <RenovarModal
          pessoa={renovando}
          plano={planoById.get(renovando.planoId)!}
          onFechar={fecharRenovacao}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint">
      {children}
    </th>
  );
}
