"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { Plano } from "@/lib/types";

export interface PlanoComContagem extends Plano {
  alunos: number;
}

type Situacao = "ativos" | "arquivados";
type Coluna = "nome" | "duracao" | "alunos" | "valor";
type Direcao = "asc" | "desc";

/** Direção de partida ao clicar numa coluna nova: texto sobe, número desce. */
const DIRECAO_INICIAL: Record<Coluna, Direcao> = {
  nome: "asc",
  duracao: "desc",
  alunos: "desc",
  valor: "desc",
};

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function comparar(a: PlanoComContagem, b: PlanoComContagem, coluna: Coluna) {
  switch (coluna) {
    case "nome":
      return colator.compare(a.nome, b.nome);
    case "duracao":
      return a.duracaoDias - b.duracaoDias;
    case "alunos":
      return a.alunos - b.alunos;
    case "valor":
      return a.valorMensal - b.valorMensal;
  }
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/**
 * Leitura aproximada em meses ao lado dos dias — o contrato é vendido como
 * "semestral", mas vale em dias; mostrar os dois evita conferência de cabeça.
 */
function equivalenteEmMeses(dias: number): string | null {
  const meses = Math.round(dias / 30.44);
  return meses >= 2 ? `≈ ${meses} meses` : null;
}

export function GestaoPlanos({ planos }: { planos: PlanoComContagem[] }) {
  const router = useRouter();
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState<Plano | null>(null);
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  // Espelha a ordem que o servidor devolve (valorMensal desc).
  const [coluna, setColuna] = useState<Coluna>("valor");
  const [direcao, setDirecao] = useState<Direcao>("desc");

  const contagem = useMemo(
    () => ({
      ativos: planos.filter((p) => p.ativo !== false).length,
      arquivados: planos.filter((p) => p.ativo === false).length,
    }),
    [planos],
  );

  const visiveis = useMemo(() => {
    const arquivado = situacao === "arquivados";
    const sinal = direcao === "asc" ? 1 : -1;
    return planos
      .filter((p) => (p.ativo === false) === arquivado)
      .sort((a, b) => sinal * comparar(a, b, coluna));
  }, [planos, situacao, coluna, direcao]);

  function ordenarPor(c: Coluna) {
    if (c === coluna) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setColuna(c);
    setDirecao(DIRECAO_INICIAL[c]);
  }

  async function arquivar(p: Plano, ativo: boolean) {
    await fetch(`/api/planos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Planos
        </h2>
        <button
          onClick={() => setModalNovo(true)}
          className="rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
        >
          + Novo plano
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "ativos", label: "Ativos" },
            { key: "arquivados", label: "Arquivados" },
          ] as const
        ).map((chip) => {
          const ativo = situacao === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => setSituacao(chip.key)}
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
            {situacao === "ativos"
              ? "Nenhum plano ativo."
              : "Nenhum plano arquivado."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th coluna="nome" atual={coluna} direcao={direcao} onOrdenar={ordenarPor}>
                    Plano
                  </Th>
                  <Th coluna="duracao" atual={coluna} direcao={direcao} onOrdenar={ordenarPor}>
                    Duração
                  </Th>
                  <Th coluna="alunos" atual={coluna} direcao={direcao} onOrdenar={ordenarPor}>
                    Alunos
                  </Th>
                  <Th
                    coluna="valor"
                    atual={coluna}
                    direcao={direcao}
                    onOrdenar={ordenarPor}
                    className="text-right"
                  >
                    Valor/mês
                  </Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const inativo = p.ativo === false;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-medium",
                            inativo ? "text-muted" : "text-ink",
                          )}
                        >
                          {p.nome}
                        </span>
                        {p.descricao && (
                          <p className="text-xs text-faint">{p.descricao}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {p.duracaoDias} {p.duracaoDias === 1 ? "dia" : "dias"}
                        {equivalenteEmMeses(p.duracaoDias) && (
                          <span className="block text-xs text-faint">
                            {equivalenteEmMeses(p.duracaoDias)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.alunos}</td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-semibold",
                          inativo ? "text-muted" : "text-ink",
                        )}
                      >
                        {formatBRL(p.valorMensal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setEditando(p)}
                            className="text-xs font-medium text-faint transition-colors hover:text-red-bright"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => arquivar(p, inativo)}
                            className="text-xs font-medium text-faint transition-colors hover:text-ink"
                          >
                            {inativo ? "Reativar" : "Arquivar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalNovo && (
        <ModalPlano
          onFechar={() => setModalNovo(false)}
          onSalvo={() => {
            setModalNovo(false);
            router.refresh();
          }}
        />
      )}
      {editando && (
        <ModalPlano
          plano={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ModalPlano({
  plano,
  onFechar,
  onSalvo,
}: {
  plano?: Plano;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const editando = Boolean(plano);
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [valor, setValor] = useState(
    plano ? String(plano.valorMensal).replace(".", ",") : "",
  );
  const [duracao, setDuracao] = useState(String(plano?.duracaoDias ?? 30));
  const [descricao, setDescricao] = useState(plano?.descricao ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro("");
    const v = Number(valor.replace(",", "."));
    const d = Number(duracao);
    if (!nome.trim()) return setErro("Informe o nome do plano.");
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor válido.");
    if (!Number.isInteger(d) || d < 1) return setErro("Duração inválida.");

    setEnviando(true);
    const url = editando ? `/api/planos/${plano!.id}` : "/api/planos";
    const method = editando ? "PATCH" : "POST";
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          valorMensal: v,
          duracaoDias: d,
          descricao,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErro(data?.erro ?? "Não foi possível salvar.");
        setEnviando(false);
        return;
      }
      onSalvo();
    } catch {
      setErro("Falha de conexão.");
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
      >
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          {editando ? "Editar plano" : "Novo plano"}
        </h3>

        <div className="mt-5 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nome</label>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Mensal, Trimestral…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Valor mensal (R$)
            </label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Duração (dias)
            </label>
            <input
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              inputMode="numeric"
              placeholder="30"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-faint">
              30 = mensal · 90 = trimestral · 180 = semestral · 365 = anual
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Descrição (opcional)
            </label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={enviar}
            disabled={enviando}
            className={cn(
              "flex-1 rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
              enviando
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : "bg-red text-white hover:bg-red-bright",
            )}
          >
            {enviando ? "Salvando…" : editando ? "Salvar" : "Criar plano"}
          </button>
          <button
            onClick={onFechar}
            className="rounded-lg border border-border-strong px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

type ThProps = {
  children: React.ReactNode;
  className?: string;
} & (
  | { coluna?: undefined; atual?: undefined; direcao?: undefined; onOrdenar?: undefined }
  | {
      coluna: Coluna;
      atual: Coluna;
      direcao: Direcao;
      onOrdenar: (c: Coluna) => void;
    }
);

function Th({ children, className, coluna, atual, direcao, onOrdenar }: ThProps) {
  const base = cn(
    "px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint",
    className,
  );

  if (!coluna) return <th className={base}>{children}</th>;

  const ordenada = atual === coluna;
  return (
    <th
      className={base}
      aria-sort={
        ordenada
          ? direcao === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        onClick={() => onOrdenar(coluna)}
        className={cn(
          "inline-flex items-center gap-1.5 uppercase tracking-widest transition-colors hover:text-ink",
          ordenada && "text-ink",
          className?.includes("text-right") && "flex-row-reverse",
        )}
      >
        {children}
        <span aria-hidden className={cn("text-[10px]", !ordenada && "opacity-25")}>
          {ordenada && direcao === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}
