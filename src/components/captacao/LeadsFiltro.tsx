"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { Bandeira } from "@/components/ui/Bandeira";
import { NovoCadastro } from "@/components/clientes/NovoCadastro";
import { Botao } from "@/components/ui/Botao";
import { classeCampoEmLinha } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import { formatData } from "@/lib/mock-data";
import { normalizar } from "@/lib/whatsapp/busca";
import {
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type Lead,
  type LeadEstagio,
  type Plano,
} from "@/lib/types";

type Filtro = "todos" | LeadEstagio;

const ORDEM: LeadEstagio[] = ["novo", "qualificado", "interesse", "convertido", "perdido"];

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Busca local por nome ou telefone, nos leads que a página já carregou. */
function casaLead(l: Lead, termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return true;
  const d = soDigitos(termo);
  if (d.length >= 3 && soDigitos(l.telefone).includes(d)) return true;
  return normalizar(l.nome).includes(t);
}

/**
 * O funil da Captação: estágio e origem de cada lead (os mesmos estágios que a
 * classificação do Atendimento move), com a próxima ação ao lado — abrir a
 * ficha, responder na conversa e iniciar a matrícula.
 */
export function LeadsFiltro({ leads, planos }: { leads: Lead[]; planos: Plano[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const termo = busca.trim();

  const contagem = useMemo(() => {
    const c = { todos: leads.length } as Record<Filtro, number>;
    for (const e of ORDEM) c[e] = leads.filter((l) => l.estagio === e).length;
    return c;
  }, [leads]);

  const visiveis = leads.filter((l) => (filtro === "todos" || l.estagio === filtro) && casaLead(l, termo));

  const chips: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    ...ORDEM.map((e) => ({ key: e, label: LEAD_ESTAGIO_LABEL[e] })),
  ];

  const filtrando = filtro !== "todos" || termo !== "";
  const vazio =
    leads.length === 0
      ? "Nenhum lead ainda. Quem chama no WhatsApp entra aqui sozinho; lead de balcão ou indicação, cadastre em “+ Novo lead”."
      : termo
        ? `Nenhum lead com “${termo}”${filtro !== "todos" ? ` em ${LEAD_ESTAGIO_LABEL[filtro]}` : ""}. A busca cobre nome e telefone.`
        : "Nenhum lead nesta categoria.";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar leads por nome ou telefone"
          placeholder="Buscar por nome ou telefone…"
          className={cn(classeCampoEmLinha, "w-full max-w-sm")}
        />
        <NovoCadastro modo="lead" />
      </div>

      <div role="group" aria-label="Estágio" className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {chips.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button
              type="button"
              key={chip.key}
              onClick={() => setFiltro(chip.key)}
              aria-pressed={ativo}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors sm:gap-2 sm:px-3.5",
                ativo
                  ? "border-brand/60 bg-brand-soft text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              {chip.key !== "todos" && <Bandeira estagio={chip.key} />}
              <span>{chip.label}</span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold",
                  ativo ? "bg-brand text-white" : "bg-surface-2 text-muted",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
        {filtrando && (
          <Botao
            variante="discreto"
            tamanho="sm"
            onClick={() => {
              setFiltro("todos");
              setBusca("");
            }}
          >
            Limpar filtros
          </Botao>
        )}
      </div>

      {filtrando && leads.length > 0 && (
        <p role="status" className="-mt-2 text-xs text-muted">
          {visiveis.length} de {leads.length} lead{leads.length === 1 ? "" : "s"}
        </p>
      )}

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{vazio}</p>
        ) : (
          <>
            {/* mobile: cards empilhados, sem scroll horizontal */}
            <ul className="divide-y divide-border sm:hidden">
              {visiveis.map((lead) => (
                <li key={lead.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/matriculados/${lead.id}?de=captacao`}
                        className="block truncate text-sm font-medium text-ink hover:text-destaque hover:underline"
                      >
                        {lead.nome || "Sem nome"}
                      </Link>
                      <p className="text-xs text-muted">{lead.telefone || "sem telefone"}</p>
                      {lead.motivoPerdido && <p className="mt-0.5 text-xs text-muted">Motivo: {lead.motivoPerdido}</p>}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink">
                      <Bandeira estagio={lead.estagio} />
                      {LEAD_ESTAGIO_LABEL[lead.estagio]}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs text-muted">
                    <Badge>{ORIGEM_LABEL[lead.origem]}</Badge>
                    entrou em {formatData(lead.criadoEm)}
                  </span>
                  <AcoesLead lead={lead} planos={planos} />
                </li>
              ))}
            </ul>

            {/* desktop: tabela */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Nome</Th>
                    <Th>Contato</Th>
                    <Th>Estágio</Th>
                    <Th>Origem</Th>
                    <Th>Entrada</Th>
                    <Th className="text-right">Próxima ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((lead) => (
                    <tr key={lead.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <Link
                          href={`/matriculados/${lead.id}?de=captacao`}
                          className="font-medium text-ink underline-offset-2 hover:text-destaque hover:underline"
                        >
                          {lead.nome || "Sem nome"}
                        </Link>
                        {lead.motivoPerdido && <p className="mt-0.5 text-xs text-muted">Motivo: {lead.motivoPerdido}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted">{lead.telefone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                          <Bandeira estagio={lead.estagio} />
                          {LEAD_ESTAGIO_LABEL[lead.estagio]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{ORIGEM_LABEL[lead.origem]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">{formatData(lead.criadoEm)}</td>
                      <td className="px-4 py-3">
                        <AcoesLead lead={lead} planos={planos} alinhar="direita" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function AcoesLead({ lead, planos, alinhar }: { lead: Lead; planos: Plano[]; alinhar?: "direita" }) {
  const fone = lead.telefone.replace(/\D/g, "");
  const podeMatricular = lead.estagio !== "convertido";
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", alinhar === "direita" && "justify-end")}>
      {/* Com conversa no CRM, responder é por dentro (o histórico fica
          registrado). Sem conversa — lead de balcão ou indicação — só resta
          abrir o WhatsApp por fora. */}
      {lead.conversaId ? (
        <Link href={`/atendimento?c=${lead.conversaId}`} className="text-xs font-semibold text-destaque hover:underline">
          Responder →
        </Link>
      ) : fone ? (
        <a
          href={`https://wa.me/55${fone}`}
          target="_blank"
          rel="noreferrer"
          title="Abre o WhatsApp fora do CRM; a conversa não fica registrada aqui."
          className="text-xs font-medium text-muted hover:text-ink hover:underline"
        >
          WhatsApp externo ↗
        </a>
      ) : null}
      {podeMatricular && (
        <NovoCadastro
          modo="matricula"
          planos={planos}
          compacto
          lead={{ id: lead.id, nome: lead.nome, telefone: lead.telefone }}
        />
      )}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 text-xs font-semibold text-muted", className)}>{children}</th>;
}
