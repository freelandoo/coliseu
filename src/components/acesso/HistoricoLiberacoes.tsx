"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";

type Liberacao = {
  id: string;
  quando: string;
  catraca: string;
  solicitadoPor: string | null;
  motivo: string | null;
  situacao: "executada" | "aguardando" | "expirada" | "falhou";
  erro: string | null;
};

/** Evento disparado pelo botão "Liberar catraca" para a lista se atualizar. */
export const EVENTO_LIBERACAO = "coliseu:liberacao";

function resultado(l: Liberacao): { texto: string; cls: string } {
  if (l.situacao === "executada") return { texto: "Liberada no aparelho", cls: "text-ok" };
  if (l.situacao === "aguardando") return { texto: "Aguardando o agente", cls: "text-warn" };
  if (l.situacao === "expirada") return { texto: "Não liberou (agente sem resposta)", cls: "text-red-bright" };
  return { texto: "Falhou", cls: "text-red-bright" };
}

export function HistoricoLiberacoes() {
  const [itens, setItens] = useState<Liberacao[] | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/acesso/liberacoes", { cache: "no-store" });
      if (!r.ok) return;
      setItens(((await r.json()) as { liberacoes: Liberacao[] }).liberacoes);
    } catch {
      /* sem rede: mantém a última lista */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    const aoLiberar = () => void carregar();
    window.addEventListener(EVENTO_LIBERACAO, aoLiberar);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVENTO_LIBERACAO, aoLiberar);
    };
  }, [carregar]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Liberações manuais
        </h2>
        <button
          type="button"
          onClick={() => void carregar()}
          className="text-xs font-medium text-faint transition-colors hover:text-ink"
        >
          Atualizar
        </button>
      </div>
      <Card className="overflow-hidden">
        {itens === null ? (
          <p className="px-5 py-6 text-sm text-faint">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="px-5 py-6 text-sm text-faint">Nenhuma liberação manual ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {itens.map((l) => {
              const r = resultado(l);
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-ink">
                      {l.motivo || <span className="text-faint">sem motivo</span>}
                    </p>
                    <p className="text-xs text-faint">
                      {new Date(l.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })} ·{" "}
                      {l.solicitadoPor ?? "—"} · {l.catraca}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${r.cls}`} title={l.erro ?? undefined}>
                    {r.texto}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
