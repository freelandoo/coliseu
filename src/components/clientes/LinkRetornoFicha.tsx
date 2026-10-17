"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { assinarConsultaAlunos, consultaAlunosLembrada } from "@/lib/memoria-navegacao";
import { comParametro, type OrigemFicha } from "@/lib/navegacao";

/**
 * "← Voltar" da ficha. O destino já chega validado (allowlist + permissão,
 * `retornoDaFicha`). Vindo da lista de alunos, devolve a situação filtrada;
 * a busca e a posição a própria lista recupera da memória da aba.
 * Acesso direto ou nova aba: volta para a lista sem filtro.
 */
export function LinkRetornoFicha({
  href,
  rotulo,
  origem,
}: {
  href: string;
  rotulo: string;
  origem: OrigemFicha;
}) {
  const situacao = useSyncExternalStore(
    assinarConsultaAlunos,
    () => consultaAlunosLembrada()?.situacao ?? null,
    () => null,
  );
  const destino =
    origem === "alunos" && situacao ? `${href}${comParametro("", "situacao", situacao, "todos")}` : href;

  return (
    <Link
      href={destino}
      className="inline-flex min-h-8 items-center gap-1 self-start rounded text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <span aria-hidden>←</span> {rotulo}
    </Link>
  );
}
