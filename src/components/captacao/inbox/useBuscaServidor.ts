"use client";

import { useEffect, useState } from "react";
import type { ConversaBuscaItem } from "@/lib/types";

/** Resultado da busca no servidor, sempre preso ao termo que o originou. */
export type Achados =
  | { termo: string; estado: "ok"; itens: ConversaBuscaItem[] }
  | { termo: string; estado: "erro"; itens: [] };

/**
 * Busca no servidor (nome, telefone e histórico): espera a digitação parar. O
 * resultado leva o termo que o gerou; uma resposta antiga (de um termo já
 * apagado) é descartada.
 */
export function useBuscaServidor(termo: string) {
  const [achados, setAchados] = useState<Achados>({ termo: "", estado: "ok", itens: [] });

  useEffect(() => {
    if (termo.length < 2) return;
    const controle = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/whatsapp/conversas/busca?q=${encodeURIComponent(termo)}`, {
          cache: "no-store",
          signal: controle.signal,
        });
        const d = (await r.json().catch(() => null)) as { conversas?: ConversaBuscaItem[] } | null;
        if (controle.signal.aborted) return;
        if (r.ok && Array.isArray(d?.conversas)) {
          setAchados({ termo, estado: "ok", itens: d.conversas });
        } else {
          setAchados({ termo, estado: "erro", itens: [] });
        }
      } catch {
        if (!controle.signal.aborted) setAchados({ termo, estado: "erro", itens: [] });
      }
    }, 350);
    return () => {
      controle.abort();
      clearTimeout(t);
    };
  }, [termo]);

  return {
    achados,
    buscando: termo.length >= 2 && achados.termo !== termo,
    falhou: termo.length >= 2 && achados.termo === termo && achados.estado === "erro",
  };
}
