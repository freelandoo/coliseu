"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { classeBotao, type TamanhoBotao, type VarianteBotao } from "@/components/ui/Botao";

/**
 * Encerra a sessão. Usa assign em vez do router: a navegação dura descarta o
 * cache de RSC da sessão antiga, senão a tela anterior reaparece no "voltar".
 */
export function BotaoSair({
  className,
  rotulo = "Sair da conta",
  variante = "secundario",
  tamanho = "md",
}: {
  className?: string;
  rotulo?: string;
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
}) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      aria-busy={saindo || undefined}
      className={cn(classeBotao({ variante, tamanho }), className)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path
          d="M5.5 12.5H2.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path d="M9 9.5 11.5 7 9 4.5M11.5 7H5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {saindo ? "Saindo…" : rotulo}
    </button>
  );
}
