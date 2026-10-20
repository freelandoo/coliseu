"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { NovoCadastro } from "@/components/clientes/NovoCadastro";
import { RenovarModal } from "@/components/matriculados/RenovarModal";
import { CheckoutBalcao } from "@/components/matricula/CheckoutBalcao";
import { cn } from "@/lib/cn";
import {
  ALUNO_STATUS_LABEL,
  LEAD_ESTAGIO_LABEL,
  type Pessoa,
  type Plano,
} from "@/lib/types";
import { Botao } from "@/components/ui/Botao";
import { classeCampoEmLinha } from "@/components/ui/Campo";
import { formatData } from "@/lib/mock-data";
import { comParametro, lerEnum, SITUACOES_ALUNO, type SituacaoAluno } from "@/lib/navegacao";
import { consultaAlunosLembrada, lembrarConsultaAlunos } from "@/lib/memoria-navegacao";
import { useCascata } from "@/lib/useCascata";

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
  const cascata = useCascata();
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

  // Todos os planos servem para mostrar o de cada aluno (inclusive arquivado);
  // nova matrícula só oferece os contratáveis.
  const planoById = useMemo(() => new Map(planos.map((p) => [p.id, p])), [planos]);
  const contrataveis = useMemo(() => planos.filter((p) => p.ativo !== false), [planos]);

  function fecharRenovacao() {
    setRenovando(null);
    router.refresh();
  }

  function planoDe(p: Pessoa): string {
    const plano = p.planoId ? planoById.get(p.planoId) : undefined;
    if (!plano) return "Sem plano";
    return plano.ativo === false ? `${plano.nome} (arquivado)` : plano.nome;
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
      <Botao
        variante="contorno"
        tamanho="sm"
        onClick={(e) => {
          e.stopPropagation();
          if (pendente) setPagando(p);
          else setRenovando(p);
        }}
        title={pendente ? "Registrar pagamento recebido no balcão" : "Revisar a renovação deste plano"}
      >
        {pendente ? "Receber no balcão" : "Renovar"}
      </Botao>
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
        <NovoCadastro modo="matricula" planos={contrataveis} />
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
                "flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors sm:gap-2 sm:px-3.5",
                ativo
                  ? "border-brand/60 bg-brand-soft text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span className="">{chip.label}</span>
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-xs font-semibold sm:h-5 sm:min-w-5 sm:text-xs",
                  ativo ? "bg-brand text-white" : "bg-surface-2 text-muted",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      {(q || filtro !== "todos") && pessoas.length > 0 && (
        <div role="status" className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            {visiveis.length} de {pessoas.length} aluno{pessoas.length === 1 ? "" : "s"}
            {filtro !== "todos" && ` · ${CHIPS.find((c) => c.key === filtro)?.label}`}
            {q && ` · busca “${busca.trim()}”`}
          </span>
          <Botao
            variante="discreto"
            tamanho="sm"
            onClick={() => {
              mudarBusca("");
              setFiltro("todos");
            }}
          >
            Limpar consulta
          </Botao>
        </div>
      )}

      <Card className="overflow-hidden">
        <div ref={listaRef}>
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {pessoas.length === 0
              ? "Nenhum aluno cadastrado ainda. Matricule um lead pela Captação ou use “+ Nova matrícula”."
              : q
                ? `Ninguém encontrado para “${busca.trim()}”${filtro !== "todos" ? " nesta situação" : ""}. A busca cobre nome, código, CPF e telefone.`
                : "Nenhum aluno nesta situação."}
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
                      className="block truncate rounded text-sm font-medium text-ink underline-offset-2 hover:text-destaque hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <p className="text-xs text-muted">
                      {p.telefone || p.email || "—"}
                      <span className="ml-2 font-mono text-faint">{p.codigo}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {planoDe(p)}
                      {p.vencimentoPlano && ` · vence ${formatData(p.vencimentoPlano)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <Badge tone={s.tone}>{s.rotulo}</Badge>
                    <span className="ml-auto">{botaoRenovacao(p)}</span>
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
                  <Th>Plano</Th>
                  <Th>Vencimento</Th>
                  <Th>Situação</Th>
                  <Th>Ação</Th>
                  <Th>Contato</Th>
                </tr>
              </thead>
              <tbody className={cascata}>
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
                          className="rounded underline-offset-2 hover:text-destaque hover:underline"
                        >
                          {p.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink">{planoDe(p)}</td>
                      <td className="px-4 py-3 text-muted">
                        {p.vencimentoPlano ? formatData(p.vencimentoPlano) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.tone}>{s.rotulo}</Badge>
                      </td>
                      <td className="px-4 py-3">{botaoRenovacao(p)}</td>
                      <td className="px-4 py-3 text-muted">
                        {p.telefone || p.email || "—"}
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
    <th className="px-4 py-3 text-xs font-semibold text-muted">
      {children}
    </th>
  );
}
