"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Stat } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL, formatData } from "@/lib/mock-data";
import type { Despesa } from "@/lib/types";

const CATEGORIAS = [
  "Luz",
  "Água",
  "Internet",
  "Aluguel",
  "Salários",
  "Limpeza",
  "Manutenção",
  "Marketing",
];

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

export function CustosView({
  despesas,
  receita,
}: {
  despesas: Despesa[];
  receita: number;
}) {
  const router = useRouter();
  const [modalCategoria, setModalCategoria] = useState<string | null>(null);

  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const lucro = receita - totalDespesas;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;

  async function excluir(id: string) {
    await fetch(`/api/despesas/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* relatório de lucro */}
      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Resultado do mês
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="Receita recorrente"
            value={formatBRL(receita)}
            tone="ok"
            hint="MRR da base ativa"
          />
          <Stat
            label="Despesas lançadas"
            value={formatBRL(totalDespesas)}
            tone="red"
            hint={`${despesas.length} lançamento${despesas.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Lucro"
            value={formatBRL(lucro)}
            tone={lucro >= 0 ? "ok" : "red"}
            hint={`Margem ${margem.toFixed(1).replace(".", ",")}%`}
          />
        </div>
      </section>

      {/* lançar despesa */}
      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Lançar despesa
        </h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((cat) => (
            <button
              key={cat}
              onClick={() => setModalCategoria(cat)}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-red/40 hover:bg-surface-2"
            >
              + {cat}
            </button>
          ))}
          <button
            onClick={() => setModalCategoria("")}
            className="rounded-lg border border-dashed border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            + Outra despesa
          </button>
        </div>
      </section>

      {/* lista de despesas */}
      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Despesas lançadas
        </h2>
        <Card className="overflow-hidden">
          {despesas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-faint">
              Nenhuma despesa lançada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Data</Th>
                    <Th>Categoria</Th>
                    <Th>Descrição</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 text-faint">{formatData(d.data)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{d.categoria}</span>
                        {d.recorrente && (
                          <span className="ml-2 text-[11px] uppercase tracking-wide text-warn">
                            fixa
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{d.descricao || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-bright">
                        {formatBRL(d.valor)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => excluir(d.id)}
                          className="text-xs font-medium text-faint transition-colors hover:text-red-bright"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {modalCategoria !== null && (
        <ModalDespesa
          categoriaInicial={modalCategoria}
          onFechar={() => setModalCategoria(null)}
          onCriado={() => {
            setModalCategoria(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ModalDespesa({
  categoriaInicial,
  onFechar,
  onCriado,
}: {
  categoriaInicial: string;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [recorrente, setRecorrente] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro("");
    const v = Number(valor.replace(",", "."));
    if (!categoria.trim()) return setErro("Informe a categoria.");
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor válido.");

    setEnviando(true);
    try {
      const r = await fetch("/api/despesas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria,
          descricao,
          valor: v,
          data: new Date(data).toISOString(),
          recorrente,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErro(d?.erro ?? "Não foi possível lançar.");
        setEnviando(false);
        return;
      }
      onCriado();
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
          Nova despesa
        </h3>

        <div className="mt-5 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Categoria</label>
            <input
              autoFocus={!categoriaInicial}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Luz, Água, Aluguel…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Valor (R$)</label>
            <input
              autoFocus={!!categoriaInicial}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Descrição (opcional)</label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Data</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={inputCls}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
              className="h-4 w-4 accent-red-bright"
            />
            Despesa fixa mensal (recorrente)
          </label>
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
            {enviando ? "Lançando…" : "Lançar despesa"}
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
