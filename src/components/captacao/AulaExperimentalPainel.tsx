"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  dataISO,
  formatarDataCompleta,
  formatarHora,
  hojeNaAcademia,
  HORAS,
  mensagemAulaExperimental,
  MODALIDADES,
  type Modalidade,
} from "@/lib/aula-experimental";
import { lerResultado, sinalDeTempo } from "@/lib/operacao";
import type { AulaExperimentalItem, MensagemItem } from "@/lib/types";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOMES_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Quantos dias tem o mês (dia 0 do seguinte é o último deste). */
function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

type Passo = "modalidade" | "data" | "hora" | "revisao";

type Desfecho =
  | { tipo: "agendada"; aula: AulaExperimentalItem }
  | { tipo: "falha"; erro: string }
  /** A confirmação saiu, mas a agenda não gravou — não pode ser reenviada. */
  | { tipo: "parcial"; erro: string }
  | { tipo: "desconhecido" };

function ehAgendamento(v: unknown): v is { aula: AulaExperimentalItem; mensagem?: MensagemItem | null; mensagens?: MensagemItem[] } {
  return typeof v === "object" && v !== null && typeof (v as { aula?: { id?: unknown } }).aula?.id === "string";
}

/**
 * Marcar aula experimental sem sair da conversa.
 *
 * Escolher modalidade, dia e hora não manda nada: o último passo é uma revisão
 * com a pessoa, a data por extenso e o texto exato que vai sair, e só o botão
 * "Confirmar e enviar no WhatsApp" dispara o envio. A ordem do servidor é
 * enviar primeiro e gravar depois — por isso uma falha depois do envio é dita
 * com todas as letras, e nada é reenviado sozinho.
 *
 * Abrir a gaveta monta o painel do zero (a conversa troca a `key` a cada
 * abertura): reabrir no meio de um agendamento antigo é a receita para marcar
 * aula na data errada.
 */
export function AulaExperimentalPainel({
  aberto,
  conversaId,
  nome,
  telefone,
  onMensagens,
  onAgendada,
  onFechar,
}: {
  aberto: boolean;
  conversaId: string;
  nome: string;
  telefone: string;
  /** Mensagens que o envio gravou (confirmação, ou a bolha de erro). */
  onMensagens: (mensagens: MensagemItem[]) => void;
  onAgendada: (aula: AulaExperimentalItem) => void;
  onFechar: () => void;
}) {
  const [passo, setPasso] = useState<Passo>("modalidade");
  const [modalidade, setModalidade] = useState<Modalidade | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const emVoo = useRef(false);
  // "Hoje" do relógio da academia, não do aparelho.
  const hoje = hojeNaAcademia();
  const [anoHoje, mesHoje] = hoje.split("-").map(Number);
  const [cursor, setCursor] = useState({ ano: anoHoje, mes: mesHoje });

  const travado = enviando || desfecho?.tipo === "agendada" || desfecho?.tipo === "parcial" || desfecho?.tipo === "desconhecido";

  async function confirmar() {
    if (!modalidade || !data || hora === null || emVoo.current || travado) return;
    emVoo.current = true;
    setEnviando(true);
    setDesfecho(null);
    const res = await lerResultado(
      fetch(`/api/whatsapp/conversas/${conversaId}/aula-experimental`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalidade, data, hora }),
        signal: sinalDeTempo(),
      }),
      ehAgendamento,
      "Não foi possível marcar a aula.",
    );
    emVoo.current = false;
    setEnviando(false);

    if (res.tipo === "ok") {
      const novas = [...(res.dados.mensagens ?? []), ...(res.dados.mensagem ? [res.dados.mensagem] : [])];
      if (novas.length) onMensagens(novas);
      setDesfecho({ tipo: "agendada", aula: res.dados.aula });
      onAgendada(res.dados.aula);
      return;
    }
    if (res.tipo === "falha") {
      const m = res.corpo.mensagem as MensagemItem | null | undefined;
      if (m && typeof m.id === "string") onMensagens([m]);
      setDesfecho(res.corpo.enviada === true ? { tipo: "parcial", erro: res.erro } : { tipo: "falha", erro: res.erro });
      return;
    }
    setDesfecho({ tipo: "desconhecido" });
  }

  function mudarMes(passos: number) {
    setCursor((c) => {
      const d = new Date(c.ano, c.mes - 1 + passos, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
    });
  }

  function voltar() {
    setDesfecho(null);
    if (passo === "revisao") {
      setPasso("hora");
      setHora(null);
    } else if (passo === "hora") {
      setPasso("data");
      setData(null);
    } else {
      setPasso("modalidade");
      setModalidade(null);
    }
  }

  const noMesCorrente = cursor.ano === anoHoje && cursor.mes === mesHoje;
  const vazios = new Date(cursor.ano, cursor.mes - 1, 1).getDay();
  const dias = Array.from({ length: diasNoMes(cursor.ano, cursor.mes) }, (_, i) => i + 1);
  const diaSemana = data ? NOMES_SEMANA[new Date(`${data}T12:00:00`).getDay()] : "";

  const PERGUNTA: Record<Passo, string> = {
    modalidade: "Qual modalidade?",
    data: "Que dia?",
    hora: "Que horas?",
    revisao: "Revise antes de enviar",
  };

  return (
    <div className={cn("bg-surface-2/40 text-sm", aberto && "border-t border-border")}>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden" inert={!aberto}>
          <div className="max-h-[55dvh] overflow-y-auto px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                Aula experimental
                <span className="ml-1.5 font-normal text-muted">— {PERGUNTA[passo]}</span>
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {passo !== "modalidade" && !travado && (
                  <Botao variante="discreto" tamanho="sm" onClick={voltar}>
                    ← Voltar
                  </Botao>
                )}
                <Botao variante="discreto" tamanho="sm" onClick={onFechar} disabled={enviando}>
                  Fechar
                </Botao>
              </div>
            </div>

            {(modalidade || data) && passo !== "revisao" && (
              <p className="mt-1 text-xs text-muted">
                {modalidade}
                {data && ` · ${formatarDataCompleta(data)}`}
              </p>
            )}

            {passo === "modalidade" && (
              <div role="group" aria-label="Modalidade" className="mt-2 flex flex-wrap gap-1.5">
                {MODALIDADES.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => {
                      setModalidade(m);
                      setPasso("data");
                    }}
                    className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand/60 hover:bg-brand-soft"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {passo === "data" && (
              <div className="mt-2 max-w-sm rounded-lg border border-border bg-surface p-2">
                <div className="flex items-center justify-between px-1 pb-2">
                  <button
                    type="button"
                    onClick={() => mudarMes(-1)}
                    disabled={noMesCorrente}
                    aria-label="Mês anterior"
                    className="min-h-8 rounded-md px-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <span className="font-display text-sm font-semibold text-ink">
                    {MESES[cursor.mes - 1]} {cursor.ano}
                  </span>
                  <button
                    type="button"
                    onClick={() => mudarMes(1)}
                    aria-label="Próximo mês"
                    className="min-h-8 rounded-md px-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    ›
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {DIAS_SEMANA.map((d, i) => (
                    <span key={i} aria-hidden className="pb-1 text-center text-xs font-semibold text-faint">
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
                        type="button"
                        key={dia}
                        onClick={() => {
                          setData(iso);
                          setPasso("hora");
                        }}
                        disabled={passou}
                        aria-label={`${formatarDataCompleta(iso)}${ehHoje ? " (hoje)" : ""}`}
                        className={cn(
                          "aspect-square rounded-md text-sm transition-colors",
                          passou ? "cursor-not-allowed text-faint/50" : "text-ink hover:bg-brand-soft",
                          ehHoje && !passou && "border border-brand/60 font-semibold",
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
              <div role="group" aria-label="Horário" className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {HORAS.map((h) => (
                  <button
                    type="button"
                    key={h}
                    onClick={() => {
                      setHora(h);
                      setPasso("revisao");
                    }}
                    className="min-h-10 rounded-lg border border-border-strong bg-surface py-2 text-sm font-medium text-ink transition-colors hover:border-brand/60 hover:bg-brand-soft"
                  >
                    {formatarHora(h)}
                  </button>
                ))}
              </div>
            )}

            {passo === "revisao" && modalidade && data && hora !== null && (
              <div className="mt-2 flex flex-col gap-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-3 text-sm sm:grid-cols-4">
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs text-faint">Pessoa</dt>
                    <dd className="font-medium text-ink">{nome}</dd>
                    {telefone && <dd className="text-xs text-muted">{telefone}</dd>}
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Modalidade</dt>
                    <dd className="font-medium text-ink">{modalidade}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Data</dt>
                    <dd className="font-medium text-ink">
                      {formatarDataCompleta(data)} <span className="font-normal text-muted">({diaSemana})</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Horário</dt>
                    <dd className="font-medium text-ink">{formatarHora(hora)}</dd>
                  </div>
                </dl>
                <details className="rounded-lg border border-border bg-surface px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-muted">
                    Mensagem que vai sair no WhatsApp
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-ink">
                    {mensagemAulaExperimental({ modalidade, data, hora })}
                  </p>
                </details>

                {desfecho?.tipo === "agendada" ? (
                  <p role="status" className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-ink">
                    Aula marcada para {formatarDataCompleta(data)} às {formatarHora(hora)}. A confirmação foi aceita
                    para envio e está na conversa.
                  </p>
                ) : desfecho?.tipo === "parcial" ? (
                  <MensagemErro>{desfecho.erro}</MensagemErro>
                ) : desfecho?.tipo === "desconhecido" ? (
                  <MensagemErro>
                    Sem confirmação do servidor. A mensagem pode ter saído e a aula pode ter sido gravada — confira a
                    conversa e a agenda antes de marcar de novo.
                  </MensagemErro>
                ) : (
                  <>
                    {desfecho?.tipo === "falha" && <MensagemErro>{desfecho.erro} Nada foi gravado na agenda.</MensagemErro>}
                    <div className="flex flex-wrap gap-2">
                      <Botao variante="primario" onClick={() => void confirmar()} carregando={enviando}>
                        {enviando ? "Enviando e marcando…" : "Confirmar e enviar no WhatsApp"}
                      </Botao>
                      <Botao onClick={voltar} disabled={enviando}>
                        Trocar horário
                      </Botao>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
