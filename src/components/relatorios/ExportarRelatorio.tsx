"use client";

import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { PRESET_LABEL, PRESETS, type PresetPeriodo } from "@/lib/relatorios/periodo";
import { MensagemErro, classeCampoEmLinha } from "@/components/ui/Campo";

/**
 * Painel de exportação de Relatórios.
 *
 * Um relatório por vez, de propósito: marketing e financeiro respondem a
 * perguntas diferentes e circulam para gente diferente (o PDF financeiro vai
 * para o contador; o de marketing, para quem cuida do anúncio). Um documento só
 * com tudo dentro seria repassado inteiro por engano.
 */

type Tipo = "marketing" | "financeiro";
type Formato = "pdf" | "planilha";

const TIPOS: { id: Tipo; titulo: string; descricao: string }[] = [
  {
    id: "marketing",
    titulo: "Marketing",
    descricao:
      "Captação por canal, conversão, custo por lead, CAC contra LTV, motivos de perda e as listas de campanha (reativação, ausentes, aniversariantes).",
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    descricao:
      "Fechamento de caixa do período: entradas por tipo e forma de pagamento, despesas por categoria, lucro, inadimplência por tempo de atraso e ponto de equilíbrio.",
  },
];

const selectCls = classeCampoEmLinha;

export function ExportarRelatorio() {
  const [tipo, setTipo] = useState<Tipo>("marketing");
  const [preset, setPreset] = useState<PresetPeriodo>("mes-atual");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [baixando, setBaixando] = useState<Formato | null>(null);
  const [erro, setErro] = useState("");

  const personalizado = preset === "personalizado";
  const faltaData = personalizado && (!de || !ate || de > ate);

  async function exportar(formato: Formato) {
    setErro("");
    setBaixando(formato);
    try {
      const params = new URLSearchParams({ tipo, periodo: preset, formato });
      if (personalizado) {
        params.set("de", de);
        params.set("ate", ate);
      }
      const r = await fetch(`/api/relatorios/exportar?${params}`);
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { erro?: string } | null;
        setErro(d?.erro ?? "Não foi possível gerar o relatório.");
        return;
      }
      // O nome do arquivo vem do servidor: é lá que o período vira texto, e o
      // navegador salvando "download.pdf" apagaria justamente essa informação.
      const disposicao = r.headers.get("Content-Disposition") ?? "";
      const nome =
        /filename="([^"]+)"/.exec(disposicao)?.[1] ??
        `coliseu-${tipo}.${formato === "pdf" ? "pdf" : "zip"}`;

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Falha de conexão ao gerar o relatório.");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-display text-sm font-semibold text-ink">
        Exportar relatório
      </h3>
      <p className="mb-4 mt-0.5 text-xs text-faint">
        Escolha um relatório e o período. O PDF é o documento de leitura; a planilha traz as
        listas nominais por trás dos números.
      </p>

      {/* qual relatório */}
      <div className="grid gap-3 sm:grid-cols-2">
        {TIPOS.map((t) => {
          const ativo = tipo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              aria-pressed={ativo}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                ativo
                  ? "border-red/60 bg-red-ghost"
                  : "border-border bg-surface-2 hover:border-border-strong",
              )}
            >
              <span
                className={cn(
                  "font-display text-sm font-semibold",
                  ativo ? "text-red-bright" : "text-ink",
                )}
              >
                {t.titulo}
              </span>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t.descricao}</p>
            </button>
          );
        })}
      </div>

      {/* período */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-faint">
            Período
          </span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetPeriodo)}
            className={selectCls}
          >
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        {personalizado && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-faint">
                De
              </span>
              <input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className={selectCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-faint">
                Até
              </span>
              <input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className={selectCls}
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={() => exportar("pdf")}
          disabled={baixando !== null || faltaData}
          className={cn(
            "rounded-lg bg-red px-4 py-2.5 text-xs font-semibold",
            "tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60",
          )}
        >
          {baixando === "pdf" ? "Gerando…" : "Baixar PDF"}
        </button>
        <button
          type="button"
          onClick={() => exportar("planilha")}
          disabled={baixando !== null || faltaData}
          className={cn(
            "rounded-lg border border-border-strong px-4 py-2.5 font-display text-xs font-semibold",
            "text-muted transition-colors hover:text-ink disabled:opacity-60",
          )}
        >
          {baixando === "planilha" ? "Gerando…" : "Planilhas (.zip)"}
        </button>
      </div>

      {faltaData && (
        <p className="mt-3 text-xs text-warn">
          Informe as duas datas — a inicial não pode ser depois da final.
        </p>
      )}
      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

      <p className="mt-4 border-t border-border pt-3 text-xs text-faint">
        As planilhas trazem nome, telefone e situação de pagamento. É dado pessoal de aluno e
        lead: guarde no computador da academia e não repasse.
      </p>
    </Card>
  );
}
