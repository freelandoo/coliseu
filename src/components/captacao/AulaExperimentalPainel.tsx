"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  dataISO,
  formatarDiaMes,
  hojeNaAcademia,
  HORAS,
  MODALIDADES,
  type Modalidade,
} from "@/lib/aula-experimental";
import type { AulaExperimentalItem, MensagemItem } from "@/lib/types";

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Quantos dias tem o mês (dia 0 do seguinte é o último deste). */
function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

type Passo = "modalidade" | "data" | "hora";

/**
 * Marcar aula experimental sem sair da conversa: modalidade, dia, hora — e a
 * confirmação sai no WhatsApp no mesmo toque em que o horário é escolhido.
 *
 * Três telas pequenas em vez de um formulário: quem atende está no celular, com
 * a pessoa esperando resposta do outro lado. Cada passo é um toque, e o último
 * já é o envio — não existe um "confirmar" para esquecer de apertar.
 *
 * Abrir a gaveta monta o painel do zero (a conversa troca a `key` a cada
 * abertura): reabrir no meio de um agendamento antigo é a receita para marcar
 * aula na data errada.
 */
export function AulaExperimentalPainel({
  aberto,
  conversaId,
  onAgendada,
}: {
  aberto: boolean;
  conversaId: string;
  /** Recebe a aula gravada e a conversa já com a confirmação enviada. */
  onAgendada: (aula: AulaExperimentalItem, mensagens: MensagemItem[]) => void;
}) {
  const [passo, setPasso] = useState<Passo>("modalidade");
  const [modalidade, setModalidade] = useState<Modalidade | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  // Todo "hoje" daqui sai do relógio da academia, não do aparelho: é ele que
  // decide qual dia do calendário já passou.
  const hoje = hojeNaAcademia();
  const [anoHoje, mesHoje] = hoje.split("-").map(Number);

  // Mês que o calendário está mostrando; começa no mês corrente.
  const [cursor, setCursor] = useState({ ano: anoHoje, mes: mesHoje });

  /** Escolher a hora é o envio — não há passo de confirmação depois dele. */
  async function agendar(hora: number) {
    if (!modalidade || !data || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch(`/api/whatsapp/conversas/${conversaId}/aula-experimental`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalidade, data, hora }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        onAgendada(d.aula as AulaExperimentalItem, (d.mensagens ?? []) as MensagemItem[]);
      } else {
        setErro(d?.erro ?? "Não foi possível marcar a aula.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  function mudarMes(passos: number) {
    setCursor((c) => {
      const d = new Date(c.ano, c.mes - 1 + passos, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
    });
  }

  // Mês anterior ao corrente não interessa: aula experimental é sempre daqui
  // para a frente.
  const noMesCorrente = cursor.ano === anoHoje && cursor.mes === mesHoje;

  const vazios = new Date(cursor.ano, cursor.mes - 1, 1).getDay();
  const dias = Array.from({ length: diasNoMes(cursor.ano, cursor.mes) }, (_, i) => i + 1);

  return (
    // Mesmo padrão das respostas prontas: borda só aberta, colapso por 0fr.
    <div className={cn("bg-surface-2/40 text-xs", aberto && "border-t border-border")}>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-3">
            {/* Trilha do que já foi escolhido: dá para voltar em qualquer ponto
                sem fechar e recomeçar. */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted">
                Aula experimental
                <span className="ml-1.5 font-normal text-faint">
                  {passo === "modalidade" && "— qual modalidade?"}
                  {passo === "data" && "— que dia?"}
                  {passo === "hora" && "— que horas?"}
                </span>
              </p>
              {passo !== "modalidade" && (
                <button
                  onClick={() => {
                    setErro("");
                    if (passo === "hora") {
                      setPasso("data");
                      setData(null);
                    } else {
                      setPasso("modalidade");
                      setModalidade(null);
                    }
                  }}
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint transition-colors hover:text-ink"
                >
                  ← Voltar
                </button>
              )}
            </div>

            {(modalidade || data) && (
              <p className="mt-1 text-[11px] text-faint">
                {modalidade}
                {data && ` · ${formatarDiaMes(data)}`}
              </p>
            )}

            {passo === "modalidade" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MODALIDADES.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setModalidade(m);
                      setPasso("data");
                    }}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-red/60 hover:bg-red-ghost hover:text-ink"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {passo === "data" && (
              <div className="mt-2 rounded-lg border border-border bg-surface p-2">
                <div className="flex items-center justify-between px-1 pb-2">
                  <button
                    onClick={() => mudarMes(-1)}
                    disabled={noMesCorrente}
                    aria-label="Mês anterior"
                    className={cn(
                      "rounded-md px-2 py-1 text-muted transition-colors",
                      noMesCorrente ? "cursor-not-allowed opacity-30" : "hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    ‹
                  </button>
                  <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-ink">
                    {MESES[cursor.mes - 1]} {cursor.ano}
                  </span>
                  <button
                    onClick={() => mudarMes(1)}
                    aria-label="Próximo mês"
                    className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    ›
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {DIAS_SEMANA.map((d, i) => (
                    <span
                      key={i}
                      className="pb-1 text-center text-[10px] font-semibold uppercase text-faint"
                    >
                      {d}
                    </span>
                  ))}
                  {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
                  {dias.map((dia) => {
                    const iso = dataISO(cursor.ano, cursor.mes, dia);
                    const passou = iso < hoje;
                    const ehHoje = iso === hoje;
                    return (
                      <button
                        key={dia}
                        onClick={() => {
                          setData(iso);
                          setPasso("hora");
                        }}
                        disabled={passou}
                        className={cn(
                          "aspect-square rounded-md text-xs transition-colors",
                          passou
                            ? "cursor-not-allowed text-faint/40"
                            : "text-ink hover:bg-red-ghost",
                          ehHoje && !passou && "border border-red/60 font-semibold",
                        )}
                      >
                        {dia}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {passo === "hora" && (
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {HORAS.map((h) => (
                  <button
                    key={h}
                    onClick={() => void agendar(h)}
                    disabled={enviando}
                    className={cn(
                      "rounded-lg border py-2 text-xs font-medium transition-colors",
                      enviando
                        ? "cursor-wait border-border text-faint"
                        : "border-border bg-surface text-muted hover:border-red/60 hover:bg-red-ghost hover:text-ink",
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            )}

            {enviando && <p className="mt-2 text-xs text-faint">Marcando e avisando no WhatsApp…</p>}
            {erro && <p className="mt-2 text-xs text-red-bright">{erro}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
