"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";

export type MetodoBalcao = "dinheiro" | "pix" | "debito" | "credito";

const METODOS: { key: MetodoBalcao; label: string; icone: string; parcelavel?: boolean }[] = [
  { key: "dinheiro", label: "Dinheiro", icone: "💵" },
  { key: "pix", label: "PIX", icone: "⚡" },
  { key: "debito", label: "Cartão débito", icone: "💳" },
  { key: "credito", label: "Cartão crédito", icone: "💳", parcelavel: true },
];

export function CheckoutBalcao({
  personId,
  nome,
  planoNome,
  valor,
  onPago,
  onFechar,
}: {
  personId: string;
  nome: string;
  planoNome: string;
  valor: number;
  onPago: (metodo: MetodoBalcao) => void;
  onFechar: () => void;
}) {
  const [metodo, setMetodo] = useState<MetodoBalcao>("dinheiro");
  const [parcelas, setParcelas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const credito = metodo === "credito";
  const valorParcela = credito && parcelas > 1 ? valor / parcelas : valor;

  async function confirmar() {
    setErro("");
    setEnviando(true);
    try {
      const r = await fetch(`/api/pessoas/${personId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo, parcelas: credito ? parcelas : 1 }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErro(d?.erro ?? "Falha ao confirmar pagamento");
        setEnviando(false);
        return;
      }
      onPago(metodo);
    } catch {
      setErro("Sem conexão com o servidor");
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
      >
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Venda de balcão
        </h3>
        <p className="mt-0.5 text-xs text-faint">Pagamento presencial · confirma na hora</p>

        <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm">
          <Linha rotulo="Aluno" valor={nome} />
          <Linha rotulo="Plano" valor={planoNome} />
          <Linha rotulo="Total" valor={formatBRL(valor)} destaque />
        </div>

        <div className="mt-5">
          <span className="text-xs font-semibold uppercase tracking-widest text-faint">
            Forma de pagamento
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {METODOS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetodo(m.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  metodo === m.key
                    ? "border-red/60 bg-red-ghost text-ink"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
                )}
              >
                <span>{m.icone}</span>
                <span className="font-medium">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {credito && (
          <div className="mt-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-faint">Parcelas</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 6, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => setParcelas(n)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    parcelas === n
                      ? "border-red/60 bg-red-ghost text-ink"
                      : "border-border bg-surface text-muted hover:text-ink",
                  )}
                >
                  {n}x
                </button>
              ))}
            </div>
            {parcelas > 1 && (
              <p className="mt-2 text-xs text-muted">
                {parcelas}× de <span className="font-medium text-ink">{formatBRL(valorParcela)}</span>
              </p>
            )}
          </div>
        )}

        {erro && <p className="mt-4 text-xs text-red-bright">{erro}</p>}

        <button
          onClick={confirmar}
          disabled={enviando}
          className="mt-6 w-full rounded-lg bg-red px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60"
        >
          {enviando ? "Confirmando…" : `Confirmar pagamento · ${formatBRL(valor)}`}
        </button>
        <button
          onClick={onFechar}
          disabled={enviando}
          className="mt-3 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-faint">{rotulo}</span>
      <span className={cn("font-medium", destaque ? "text-lg text-red-bright" : "text-ink")}>{valor}</span>
    </div>
  );
}
