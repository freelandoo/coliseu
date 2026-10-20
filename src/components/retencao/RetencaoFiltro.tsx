"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { Botao } from "@/components/ui/Botao";
import { classeCampoEmLinha } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import type { FaixaRetencao } from "@/lib/navegacao";
import { normalizar } from "@/lib/whatsapp/busca";
import { useCascata } from "@/lib/useCascata";

export interface LinhaRetencao {
  id: string;
  nome: string;
  telefone: string;
  planoNome: string;
  ultimaPresenca: string; // já formatada (dd/mm/aaaa)
  dias: number;
  faixa: 7 | 14 | 21 | null; // null = registro recente
}

type Filtro = FaixaRetencao;

// As faixas e os cortes são os do fluxograma (7 / 14 / 21 dias), sem mudança.
const CHIPS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "frequente", label: "Menos de 7 dias" },
  { key: "7", label: "7+ dias" },
  { key: "14", label: "14+ dias" },
  { key: "21", label: "21+ dias" },
];

const FAIXA_INFO: Record<"frequente" | "7" | "14" | "21", { rotulo: string; tone: "ok" | "warn" | "danger" }> = {
  frequente: { rotulo: "Em dia", tone: "ok" },
  "7": { rotulo: "Acompanhamento", tone: "warn" },
  "14": { rotulo: "Alerta de risco", tone: "danger" },
  "21": { rotulo: "Reativação", tone: "danger" },
};

const filtroDe = (faixa: LinhaRetencao["faixa"]): Exclude<Filtro, "todos"> =>
  faixa === null ? "frequente" : (String(faixa) as "7" | "14" | "21");

const infoDe = (faixa: LinhaRetencao["faixa"]) => FAIXA_INFO[filtroDe(faixa)];

/** Mantém a faixa na URL, para o voltar da ficha (e o do navegador) cair nela. */
function gravarFaixaNaUrl(filtro: Filtro) {
  const url = new URL(window.location.href);
  if (filtro === "todos") url.searchParams.delete("faixa");
  else url.searchParams.set("faixa", filtro);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Lista de retenção com filtro por faixa e busca local. Contato é manual: o
 * WhatsApp abre fora do CRM, e quem decide falar com quem é a recepção.
 */
export function RetencaoFiltro({
  linhas,
  filtroInicial = "todos",
}: {
  linhas: LinhaRetencao[];
  filtroInicial?: Filtro;
}) {
  const cascata = useCascata();
  const [filtro, setFiltroEstado] = useState<Filtro>(filtroInicial);
  const setFiltro = (f: Filtro) => {
    setFiltroEstado(f);
    gravarFaixaNaUrl(f);
  };
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca);
  const digitos = busca.replace(/\D/g, "");

  const contagem = useMemo(
    () => ({
      todos: linhas.length,
      frequente: linhas.filter((l) => l.faixa === null).length,
      "7": linhas.filter((l) => l.faixa === 7).length,
      "14": linhas.filter((l) => l.faixa === 14).length,
      "21": linhas.filter((l) => l.faixa === 21).length,
    }),
    [linhas],
  );

  const visiveis = linhas.filter((l) => {
    const naFaixa = filtro === "todos" || filtroDe(l.faixa) === filtro;
    if (!naFaixa) return false;
    if (!termo) return true;
    return normalizar(l.nome).includes(termo) || (digitos.length >= 3 && l.telefone.replace(/\D/g, "").includes(digitos));
  });
  const filtrando = filtro !== "todos" || !!termo;
  const hrefFicha = (id: string) =>
    `/matriculados/${id}?de=retencao${filtro === "todos" ? "" : `&faixa=${filtro}`}`;

  return (
    <div className="flex flex-col gap-5">
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar aluno por nome ou telefone"
        placeholder="Buscar por nome ou telefone…"
        className={cn(classeCampoEmLinha, "w-full max-w-sm")}
      />

      <div role="group" aria-label="Dias desde o último registro" className="flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => {
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
            Limpar consulta
          </Botao>
        )}
      </div>

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {linhas.length === 0
              ? "Nenhum aluno não cancelado na base."
              : termo
                ? `Ninguém encontrado para “${busca.trim()}”.`
                : "Ninguém nesta faixa."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border sm:hidden">
              {visiveis.map((l) => {
                const info = infoDe(l.faixa);
                return (
                  <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={hrefFicha(l.id)}
                        className="block truncate text-sm font-medium text-ink hover:text-destaque hover:underline"
                      >
                        {l.nome}
                      </Link>
                      <p className="text-xs text-muted">
                        {l.planoNome} · último registro {l.ultimaPresenca} ({l.dias} dias)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <Badge tone={info.tone}>{info.rotulo}</Badge>
                      <ContatoExterno telefone={l.telefone} />
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Aluno</Th>
                    <Th>Plano</Th>
                    <Th>Último registro de presença</Th>
                    <Th>Dias desde o registro</Th>
                    <Th>Faixa</Th>
                    <Th className="text-right">Contato</Th>
                  </tr>
                </thead>
                <tbody className={cascata}>
                  {visiveis.map((l) => {
                    const info = infoDe(l.faixa);
                    return (
                      <tr key={l.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link
                            href={hrefFicha(l.id)}
                            className="font-medium text-ink underline-offset-2 hover:text-destaque hover:underline"
                          >
                            {l.nome}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted">{l.planoNome}</td>
                        <td className="px-4 py-3 text-muted">{l.ultimaPresenca}</td>
                        <td className="px-4 py-3 tabular-nums text-ink">{l.dias}</td>
                        <td className="px-4 py-3">
                          <Badge tone={info.tone}>{info.rotulo}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ContatoExterno telefone={l.telefone} />
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

function ContatoExterno({ telefone }: { telefone: string }) {
  const fone = telefone.replace(/\D/g, "");
  if (fone.length < 10) return <span className="text-xs text-muted">sem telefone</span>;
  return (
    <a
      href={`https://wa.me/55${fone}`}
      target="_blank"
      rel="noreferrer"
      title="Abre o WhatsApp fora do CRM; a conversa não fica registrada aqui."
      className="text-xs font-medium text-destaque hover:underline"
    >
      WhatsApp externo ↗
    </a>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 text-xs font-semibold text-muted", className)}>{children}</th>;
}
