"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { barraTreino } from "@/lib/freelandoo/rotulos";

/** Iniciais para o quadro sem foto. */
function iniciais(nome: string): string {
  const letras = nome
    .split(/\s+/)
    .map((p) => p.match(/\p{L}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letras || "#";
}

/**
 * Foto do aluno vinda da Freelandoo — quadrada, cantos do tabloide. Sem foto
 * (ou URL quebrada) cai nas iniciais. Decorativa: o nome está ao lado.
 */
export function FotoAluno({ nome, url, tamanho = 48 }: { nome: string; url?: string; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { width: tamanho, height: tamanho };
  if (url && !falhou) {
    return (
      // Foto vem do storage da Freelandoo (domínio externo): <img> simples, sem otimização do Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
        style={estilo}
        className="shrink-0 rounded-sm border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={estilo}
      className="flex shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2 text-sm font-semibold text-ink"
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * Barrinha da validade do treino ativo (Q8): o preenchimento é a fração de
 * dias que faltam. Vencido fica vermelho. O texto ao lado é o que leitores de
 * tela leem — a barra é só reforço visual.
 */
export function BarraTreino({
  venceEm,
  validadeDias,
  className,
}: {
  venceEm?: string;
  validadeDias?: number;
  className?: string;
}) {
  const b = barraTreino(venceEm, validadeDias);
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "relative h-1.5 w-20 shrink-0 overflow-hidden rounded-sm",
          b.situacao === "vencido" ? "bg-danger-soft" : "bg-surface-2",
        )}
      >
        {b.situacao !== "sem_treino" && b.situacao !== "vencido" && (
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-sm",
              b.situacao === "vencendo" ? "bg-warning" : "bg-success",
            )}
            style={{ width: `${Math.max(4, Math.round(b.proporcao * 100))}%` }}
          />
        )}
        {b.situacao === "vencido" && <span className="absolute inset-0 rounded-sm bg-danger" />}
      </span>
      <span
        className={cn(
          "truncate text-xs",
          b.situacao === "vencido" ? "font-medium text-danger" : b.situacao === "sem_treino" ? "text-faint" : "text-muted",
        )}
      >
        {b.texto}
      </span>
    </span>
  );
}
