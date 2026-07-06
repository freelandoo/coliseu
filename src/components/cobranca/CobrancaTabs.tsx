"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  CobrancaFiltro,
  type LinhaCobranca,
} from "@/components/cobranca/CobrancaFiltro";
import {
  GestaoPlanos,
  type PlanoComContagem,
} from "@/components/cobranca/GestaoPlanos";

type Aba = "cobrancas" | "planos";

export function CobrancaTabs({
  linhas,
  planos,
}: {
  linhas: LinhaCobranca[];
  planos: PlanoComContagem[];
}) {
  const [aba, setAba] = useState<Aba>("cobrancas");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <TabBtn ativo={aba === "cobrancas"} onClick={() => setAba("cobrancas")}>
          Cobranças
        </TabBtn>
        <TabBtn ativo={aba === "planos"} onClick={() => setAba("planos")}>
          Planos
        </TabBtn>
      </div>

      {aba === "cobrancas" ? (
        <CobrancaFiltro linhas={linhas} />
      ) : (
        <GestaoPlanos planos={planos} />
      )}
    </div>
  );
}

function TabBtn({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-4 py-2 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
        ativo
          ? "border-red/60 bg-red-ghost text-ink"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
