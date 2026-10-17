"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { NovoCadastro } from "@/components/clientes/NovoCadastro";
import { RemoverPessoa } from "@/components/clientes/RemoverPessoa";
import { RenovarModal } from "@/components/matriculados/RenovarModal";
import { CheckoutBalcao } from "@/components/matricula/CheckoutBalcao";
import { cn } from "@/lib/cn";
import {
  ALUNO_STATUS_LABEL,
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type Pessoa,
  type Plano,
} from "@/lib/types";
import { classeBotao } from "@/components/ui/Botao";
import { classeCampoEmLinha } from "@/components/ui/Campo";
import { comParametro, lerEnum, SITUACOES_ALUNO, type SituacaoAluno } from "@/lib/navegacao";
import { consultaAlunosLembrada, lembrarConsultaAlunos } from "@/lib/memoria-navegacao";

type Filtro = SituacaoAluno;

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
  tone: "neutral" | "ok" | "warn" | "danger";
} {
  if (p.fase === "lead") {
    return {
      rotulo: LEAD_ESTAGIO_LABEL[p.estagio ?? "novo"],
      tone: p.estagio === "perdido" ? "neutral" : "warn",
    };
  }
  const tone: Record<string, "neutral" | "ok" | "warn" | "danger"> = {
    ativo: "ok",
    pendente: "warn",
    inadimplente: "danger",
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
  const pathname = usePathname();
  // Situação é enumerada e não identifica ninguém: vai na URL (?situacao=).
  // A busca pode ter CPF/telefone: fica só na memória da aba (memoria-navegacao).
  const situacaoUrl = useSearchParams().get("situacao");
  const filtro: Filtro = lerEnum(situacaoUrl, SITUACOES_ALUNO, "todos");
  const [busca, setBusca] = useState(() => consultaAlunosLembrada()?.busca ?? "");
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  function setFiltro(f: Filtro) {
    // replace: filtro não é navegação, não vale uma entrada de histórico
    window.history.replaceState(
      null,
      "",
      `${pathname}${comParametro(window.location.search.slice(1), "situacao", f, "todos")}`,
    );
    lembrarConsultaAlunos({ busca, situacao: f });
  }

  function mudarBusca(b: string) {
    setBusca(b);
    lembrarConsultaAlunos({ busca: b, situacao: filtro });
  }

  function aoAbrirFicha(id: string) {
    lembrarConsultaAlunos({ busca, situacao: filtro, abriu: { id, rolagem: window.scrollY } });
  }

  // Voltando da ficha: mesma rolagem e foco na pessoa que foi aberta. Se ela
  // saiu da consulta, o foco vai para a busca — nunca para outra pessoa.
  useEffect(() => {
    const lembrada = consultaAlunosLembrada();
    if (!lembrada?.abriu) return;
    const { id, rolagem } = lembrada.abriu;
    lembrarConsultaAlunos({ busca: lembrada.busca, situacao: lembrada.situacao });
    window.scrollTo({ top: rolagem });
    const link = Array.from(
      listaRef.current?.querySelectorAll<HTMLElement>(`[data-ficha-id="${CSS.escape(id)}"]`) ?? [],
    ).find((el) => el.getClientRects().length > 0);
    (link ?? buscaRef.current)?.focus({ preventScroll: true });
  }, []);
  const [renovando, setRenovando] = useState<Pessoa | null>(null);
  const [pagando, setPagando] = useState<Pessoa | null>(null);

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

  // Botão de renovação/pagamento — compartilhado entre a tabela (desktop)
  // e os cards (mobile). Pendente vira checkout de balcão: confirma o
  // pagamento, ativa e libera a catraca.
  function botaoRenovacao(p: Pessoa) {
    const plano = p.planoId ? planoById.get(p.planoId) : undefined;
    if (!plano) return null;
    const pendente = p.status === "pendente";
    return (
      <button type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (pendente) setPagando(p);
          else setRenovando(p);
        }}
        className={classeBotao({ variante: "contorno", tamanho: "sm" })}
      >
        {pendente ? "Confirmar pgto" : "Renovar"}
      </button>
    );
  }

  // sem useMemo: o React Compiler memoiza (o manual não podia ser preservado)
  const q = busca.trim().toLowerCase();
  const qd = soDigitos(busca);
  const visiveis = pessoas.filter((p) => {
    if (!combina(p, filtro)) return false;
    if (!q) return true;
    return (
      p.nome.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (!!p.cpf && soDigitos(p.cpf).includes(qd) && qd.length > 0) ||
      (!!p.telefone && soDigitos(p.telefone).includes(qd) && qd.length > 0)
    );
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          ref={buscaRef}
          type="search"
          value={busca}
          onChange={(e) => mudarBusca(e.target.value)}
          aria-label="Buscar alunos"
          placeholder="Buscar por nome, código, CPF ou telefone…"
          className={`${classeCampoEmLinha} w-full max-w-sm`}
        />
        <NovoCadastro planos={planos} />
      </div>

      <div role="group" aria-label="Situação" className="flex flex-wrap gap-1.5 sm:gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button type="button"
              key={chip.key}
              onClick={() => setFiltro(chip.key)}
              aria-pressed={ativo}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm",
                ativo
                  ? "border-red/60 bg-red-ghost text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span className="">{chip.label}</span>
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-xs font-semibold sm:h-5 sm:min-w-5 sm:text-xs",
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
        <div ref={listaRef}>
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">
            Nenhuma pessoa nesta categoria.
          </p>
        ) : (
          <>
          {/* mobile: cards empilhados, sem scroll horizontal */}
          <div className="divide-y divide-border sm:hidden">
            {visiveis.map((p) => {
              const s = situacaoDe(p);
              return (
                <div key={p.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/matriculados/${p.id}`}
                      data-ficha-id={p.id}
                      onClick={() => aoAbrirFicha(p.id)}
                      className="block truncate rounded text-sm font-medium text-ink underline-offset-2 hover:text-brand hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <p className="text-xs text-muted">
                      {p.telefone || p.email || "—"}
                      <span className="ml-2 font-mono text-faint">{p.codigo}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge>{ORIGEM_LABEL[p.origem]}</Badge>
                      <Badge tone={s.tone}>{s.rotulo}</Badge>
                    </span>
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      {botaoRenovacao(p)}
                      <RemoverPessoa id={p.id} nome={p.nome} />
                    </span>
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
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-faint">{p.codigo}</td>
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/matriculados/${p.id}`}
                          data-ficha-id={p.id}
                          onClick={() => aoAbrirFicha(p.id)}
                          className="rounded underline-offset-2 hover:text-brand hover:underline"
                        >
                          {p.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {p.telefone || p.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{ORIGEM_LABEL[p.origem]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.tone}>{s.rotulo}</Badge>
                      </td>
                      <td className="px-4 py-3">{botaoRenovacao(p)}</td>
                      <td className="px-4 py-3">
                        <RemoverPessoa id={p.id} nome={p.nome} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        </div>
      </Card>

      {renovando && renovando.planoId && planoById.get(renovando.planoId) && (
        <RenovarModal
          pessoa={renovando}
          plano={planoById.get(renovando.planoId)!}
          onFechar={fecharRenovacao}
        />
      )}

      {pagando && pagando.planoId && planoById.get(pagando.planoId) && (
        <CheckoutBalcao
          personId={pagando.id}
          nome={pagando.nome}
          planoNome={planoById.get(pagando.planoId)!.nome}
          valor={planoById.get(pagando.planoId)!.valorMensal}
          onPago={() => {
            setPagando(null);
            router.refresh();
          }}
          onFechar={() => setPagando(null)}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-faint">
      {children}
    </th>
  );
}
