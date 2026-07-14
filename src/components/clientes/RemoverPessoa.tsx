"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Remove uma pessoa (lead ou matriculado) com confirmação. Usa o DELETE
 * /api/pessoas/[id], que apaga a ficha e remove a pessoa das catracas (LGPD).
 * O stopPropagation no wrapper protege linhas de tabela clicáveis.
 */
export function RemoverPessoa({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState("");

  async function remover() {
    setErro("");
    setRemovendo(true);
    const r = await fetch(`/api/pessoas/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(d?.erro ?? "Não foi possível remover.");
      setRemovendo(false);
      return;
    }
    setConfirmando(false);
    setRemovendo(false);
    router.refresh();
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-faint transition-colors hover:border-red/60 hover:text-red-bright"
      >
        Remover
      </button>

      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !removendo && setConfirmando(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
          >
            <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Remover cadastro
            </h3>
            <p className="mt-2 text-sm text-muted">
              Remover <strong className="text-ink">{nome}</strong>? Apaga a ficha, o histórico e a
              biometria das catracas. Não dá para desfazer.
            </p>
            {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}
            <div className="mt-5 flex gap-3">
              <button
                onClick={remover}
                disabled={removendo}
                className="flex-1 rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60"
              >
                {removendo ? "Removendo…" : "Remover"}
              </button>
              <button
                onClick={() => setConfirmando(false)}
                disabled={removendo}
                className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
