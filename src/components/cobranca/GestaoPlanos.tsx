"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { Plano } from "@/lib/types";

export interface PlanoComContagem extends Plano {
  alunos: number;
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

export function GestaoPlanos({ planos }: { planos: PlanoComContagem[] }) {
  const router = useRouter();
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState<Plano | null>(null);

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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Plano</Th>
                <Th>Duração</Th>
                <Th>Alunos</Th>
                <Th className="text-right">Valor/mês</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p) => {
                const inativo = p.ativo === false;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors hover:bg-surface-2",
                      inativo && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{p.nome}</span>
                      {inativo && (
                        <Badge tone="neutral" className="ml-2">
                          Arquivado
                        </Badge>
                      )}
                      {p.descricao && (
                        <p className="text-xs text-faint">{p.descricao}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.duracaoMeses} {p.duracaoMeses === 1 ? "mês" : "meses"}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.alunos}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
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
  const [duracao, setDuracao] = useState(String(plano?.duracaoMeses ?? 1));
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
          duracaoMeses: d,
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
              Duração (meses)
            </label>
            <input
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              inputMode="numeric"
              placeholder="1"
              className={inputCls}
            />
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
