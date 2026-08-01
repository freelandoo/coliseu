"use client";

import { useCallback, useEffect, useState } from "react";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";

/** Rede de segurança: o SSE avisa na hora; isto cobre um stream caído. */
const FALLBACK_MS = 60_000;

/**
 * Contador de não lidas no menu Atendimento — substitui o badge que a antiga
 * aba mostrava dentro da Captação. Atualiza pelo mesmo stream do inbox; abrir
 * uma conversa zera no servidor e o número acerta no próximo aviso ou polling.
 */
async function buscarNaoLidas(): Promise<number | null> {
  try {
    const r = await fetch("/api/whatsapp/nao-lidas", { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { naoLidas?: number };
    return d.naoLidas ?? 0;
  } catch {
    return null; // rede instável: o próximo aviso ou polling acerta
  }
}

export function NaoLidasBadge() {
  const [naoLidas, setNaoLidas] = useState(0);

  const atualizar = useCallback(async () => {
    const n = await buscarNaoLidas();
    if (n !== null) setNaoLidas(n);
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const n = await buscarNaoLidas();
      if (ativo && n !== null) setNaoLidas(n);
    })();
    const desassinar = assinarMensagens(() => void atualizar());
    const t = setInterval(() => void atualizar(), FALLBACK_MS);
    return () => {
      ativo = false;
      desassinar();
      clearInterval(t);
    };
  }, [atualizar]);

  if (naoLidas <= 0) return null;
  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded bg-red px-1 text-[10px] font-semibold text-white">
      {naoLidas}
    </span>
  );
}
