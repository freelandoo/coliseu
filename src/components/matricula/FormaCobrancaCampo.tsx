"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { classeCampoEmLinha } from "@/components/ui/Campo";
import {
  aceitaParcelamento,
  mesesDoPlano,
  opcoesDeParcelas,
  valorTotalDoPlano,
  type FormaCobranca,
} from "@/lib/billing/parcelamento";
import type { Plano } from "@/lib/types";

/** Escolha da tela: guarda as parcelas mesmo com a assinatura marcada (voltar não perde a escolha). */
export interface EscolhaCobranca {
  parcelado: boolean;
  parcelas: number | null; // null = um boleto por mês de vigência
}

export const ESCOLHA_PADRAO: EscolhaCobranca = { parcelado: false, parcelas: null };

/** O que vai para o servidor. Plano que não parcela sempre vira assinatura. */
export function formaDaEscolha(e: EscolhaCobranca, plano: Plano): FormaCobranca {
  if (!e.parcelado || !aceitaParcelamento(plano)) return { tipo: "assinatura" };
  const max = mesesDoPlano(plano.duracaoDias);
  return { tipo: "boleto_parcelado", parcelas: Math.min(e.parcelas ?? max, max) };
}

/** Texto curto da forma, para a revisão e o resultado. */
export function descreverForma(f: FormaCobranca, plano: Plano): string {
  if (f.tipo === "assinatura") return `Assinatura mensal · ${formatBRL(plano.valorMensal)}/mês (PIX, boleto ou cartão)`;
  const total = valorTotalDoPlano(plano);
  return `Boleto parcelado · ${f.parcelas}× de ${formatBRL(total / f.parcelas)} (total ${formatBRL(total)})`;
}

/**
 * Assinatura mensal recorrente (padrão) ou o plano inteiro em boletos, um por
 * mês. Só aparece para plano de mais de um mês.
 */
export function FormaCobrancaCampo({
  plano,
  escolha,
  onChange,
  disabled,
}: {
  plano: Plano;
  escolha: EscolhaCobranca;
  onChange: (e: EscolhaCobranca) => void;
  disabled?: boolean;
}) {
  const parcelasId = useId();
  if (!aceitaParcelamento(plano)) return null;
  const forma = formaDaEscolha(escolha, plano);
  const parcelas = forma.tipo === "boleto_parcelado" ? forma.parcelas : mesesDoPlano(plano.duracaoDias);
  const total = valorTotalDoPlano(plano);

  const opcao = (ativa: boolean) =>
    cn(
      "rounded-lg border px-4 py-2.5 text-left transition-colors disabled:opacity-60",
      ativa ? "border-brand bg-brand-soft" : "border-border-strong bg-surface hover:border-control",
    );

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold text-ink">Forma de cobrança</legend>
      <button
        type="button"
        aria-pressed={!escolha.parcelado}
        onClick={() => onChange({ ...escolha, parcelado: false })}
        className={opcao(!escolha.parcelado)}
      >
        <span className="block text-sm font-semibold text-ink">Assinatura mensal</span>
        <span className="block text-xs text-muted">
          {formatBRL(plano.valorMensal)} todo mês · o aluno escolhe PIX, boleto ou cartão no link
        </span>
      </button>
      <div className={opcao(escolha.parcelado)}>
        <button
          type="button"
          aria-pressed={escolha.parcelado}
          onClick={() => onChange({ ...escolha, parcelado: true })}
          className="block w-full text-left"
        >
          <span className="block text-sm font-semibold text-ink">Boleto parcelado</span>
          <span className="block text-xs text-muted">
            Plano inteiro ({formatBRL(total)}) em boletos, um por mês, com carnê em PDF
          </span>
        </button>
        {escolha.parcelado && (
          <label htmlFor={parcelasId} className="mt-2 flex items-center gap-2 text-sm text-ink">
            <select
              id={parcelasId}
              value={parcelas}
              onChange={(e) => onChange({ parcelado: true, parcelas: Number(e.target.value) })}
              className={classeCampoEmLinha}
            >
              {opcoesDeParcelas(plano).map((n) => (
                <option key={n} value={n}>
                  {n}× de {formatBRL(total / n)}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">1º boleto vence amanhã</span>
          </label>
        )}
      </div>
    </fieldset>
  );
}
