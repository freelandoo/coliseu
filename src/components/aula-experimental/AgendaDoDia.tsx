"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgendarAulaBalcao } from "@/components/aula-experimental/AgendarAulaBalcao";
import { cn } from "@/lib/cn";
import {
  formatarDiaPorExtenso,
  formatarHora,
  formatarHoraAgenda,
  HORA_MAX,
  HORA_MIN,
  momentoDaVisita,
  OBSERVACAO_MAX,
  type MomentoVisita,
} from "@/lib/aula-experimental";
import type { AulaExperimentalItem } from "@/lib/types";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import {
  BadgeStatus,
  EstadoVazio,
  IconeSetaDireita,
  Listras,
  PainelAngular,
  type TomStatus,
} from "@/components/ui/editorial";
import { lerResultado } from "@/lib/operacao";

/**
 * A agenda do dia escolhido no calendário: quem vem, a que horas, e o atalho
 * para a conversa da pessoa no Atendimento.
 *
 * O status é o do RELÓGIO ("horário passou", "agora", "agendada") — o sistema
 * não guarda confirmação nem presença, então não finge ter. Abrir a conversa é
 * só navegação: nada é enviado daqui; o envio no Atendimento é sempre revisado.
 */
const STATUS: Record<MomentoVisita, { tom: TomStatus; rotulo: string }> = {
  agora: { tom: "atencao", rotulo: "Agora" },
  adiante: { tom: "info", rotulo: "Agendada" },
  passou: { tom: "neutro", rotulo: "Horário passou" },
};

export function AgendaDoDia({
  aulas,
  dia,
  hoje,
  horaAgora,
  modalidade,
}: {
  aulas: AulaExperimentalItem[];
  dia: string;
  hoje: string;
  horaAgora: number;
  /** Filtro de modalidade em uso — entra na frase do vazio. */
  modalidade: string | null;
}) {
  const doDia = [...aulas].filter((a) => a.data === dia).sort((a, b) => a.hora - b.hora);
  const ehHoje = dia === hoje;

  return (
    <PainelAngular tom="papel" aria-labelledby="agenda-titulo" className="overflow-hidden">
      <div className="px-4 pb-4 pt-5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="agenda-titulo" className="font-manchete text-[2rem] text-ink sm:text-[2.5rem]">
            Agenda do dia
          </h2>
          {ehHoje && (
            <span className="meta-mono mt-1 shrink-0 bg-ink px-1.5 py-0.5 text-[0.6875rem] text-surface">Hoje</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <p className="meta-mono text-ink">{formatarDiaPorExtenso(dia)}</p>
          <span aria-hidden className="h-px flex-1 bg-ink/25" />
          <Listras className="h-3 w-14 shrink-0 text-brand" />
        </div>
        <p className="mt-2 text-xs text-muted tabular-nums">
          {doDia.length === 0
            ? "Nenhuma visita neste dia"
            : `${doDia.length} visita${doDia.length > 1 ? "s" : ""}${modalidade ? ` de ${modalidade}` : ""}`}
        </p>

        <ReguaExpediente horas={doDia.map((a) => a.hora)} horaAgora={ehHoje ? horaAgora : null} />
      </div>

      {doDia.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EstadoVazio
            titulo={
              modalidade
                ? `Nenhuma aula de ${modalidade} agendada para este dia.`
                : "Nenhuma aula agendada para este dia."
            }
            acao={
              dia >= hoje && (
                <AgendarAulaBalcao
                  dia={dia}
                  rotulo="Agendar neste dia"
                  variante="secundario"
                  tamanho="md"
                  className="border-ink bg-transparent"
                />
              )
            }
          >
            {dia >= hoje
              ? "Marque por aqui ou pela conversa da pessoa no Atendimento, em “Aula experimental”."
              : "Este dia já passou."}
          </EstadoVazio>
        </div>
      ) : (
        <>
          <ol className="border-t border-ink/15">
            {doDia.map((aula) => (
              <ItemAgenda key={aula.id} aula={aula} momento={momentoDaVisita(aula, hoje, horaAgora)} />
            ))}
          </ol>
          {dia >= hoje && (
            <div className="border-t border-ink/15 px-4 py-3 sm:px-5">
              <AgendarAulaBalcao dia={dia} rotulo="Agendar neste dia" variante="discreto" tamanho="sm" />
            </div>
          )}
        </>
      )}
    </PainelAngular>
  );
}

/**
 * A régua do expediente: as horas em que se pode marcar (HORA_MIN a HORA_MAX)
 * com as visitas do dia em vermelho e o "agora" quando o dia é hoje. Decorativa
 * para leitor de tela — a lista abaixo diz o mesmo em texto.
 */
function ReguaExpediente({ horas, horaAgora }: { horas: number[]; horaAgora: number | null }) {
  const total = HORA_MAX - HORA_MIN;
  const pos = (h: number) => `${((h - HORA_MIN) / total) * 100}%`;
  const marcos = [6, 10, 14, 18, 22].filter((h) => h >= HORA_MIN && h <= HORA_MAX);
  const agoraNaRegua = horaAgora !== null && horaAgora >= HORA_MIN && horaAgora <= HORA_MAX;

  return (
    <div aria-hidden className="mt-4 select-none">
      <div className="relative h-5">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/30" />
        {marcos.map((h) => (
          <span key={h} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-ink/45" style={{ left: pos(h) }} />
        ))}
        {agoraNaRegua && (
          <span
            className="absolute -top-0.5 bottom-[-2px] w-0.5 -translate-x-1/2 bg-ink"
            style={{ left: pos(horaAgora) }}
          />
        )}
        {horas.map((h, i) => (
          <span
            key={`${h}-${i}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 bg-brand"
            style={{ left: pos(h) }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 font-mono text-[0.6875rem] font-medium text-muted tabular-nums">
        {marcos.map((h, i) => (
          <span
            key={h}
            className={cn(
              "absolute",
              i === 0 ? "left-0" : i === marcos.length - 1 ? "right-0" : "-translate-x-1/2",
            )}
            style={i === 0 || i === marcos.length - 1 ? undefined : { left: pos(h) }}
          >
            {formatarHora(h)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ItemAgenda({ aula, momento }: { aula: AulaExperimentalItem; momento: MomentoVisita }) {
  const status = STATUS[momento];
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 border-b border-ink/15 px-4 py-4 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:px-5">
      <p
        className={cn(
          "font-display text-[1.375rem] font-bold leading-none tabular-nums sm:text-[1.625rem]",
          momento === "passou" ? "text-muted" : "text-ink",
        )}
      >
        <time dateTime={`${aula.data}T${formatarHoraAgenda(aula.hora)}`}>{formatarHoraAgenda(aula.hora)}</time>
      </p>

      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand" />
          <span className="truncate">{aula.nome}</span>
        </p>
        <p className="mt-0.5 pl-4 text-[0.8125rem] text-muted">
          {aula.modalidade}
          {aula.agendadoPor && <> · marcada por {aula.agendadoPor}</>}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pl-4">
          <BadgeStatus tom={status.tom}>{status.rotulo}</BadgeStatus>
          {aula.conversaId ? (
            <Link
              href={`/atendimento?c=${aula.conversaId}`}
              className={cn(classeBotao({ variante: "secundario", tamanho: "sm" }), "border-ink bg-transparent")}
            >
              Ver conversa
              <IconeSetaDireita />
            </Link>
          ) : (
            <span className="text-xs text-muted">Sem conversa vinculada</span>
          )}
        </div>

        <ObservacaoCampo aula={aula} />
      </div>
    </li>
  );
}

/**
 * Rascunhos de observação ainda não salvos, por aula — só na memória da aba.
 * Trocar de dia ou de visão desmonta o campo; o que foi digitado volta quando
 * ele reaparece, e sair da página com rascunho pendente pede confirmação.
 */
const rascunhosObservacao = new Map<string, string>();

function avisarSaida(e: BeforeUnloadEvent) {
  if (rascunhosObservacao.size > 0) e.preventDefault();
}

function ehAulaSalva(v: unknown): v is { aula: AulaExperimentalItem } {
  return typeof v === "object" && v !== null && typeof (v as { aula?: { id?: unknown } }).aula?.id === "string";
}

/**
 * O campo de observação da visita — recado interno, nunca vai para o WhatsApp.
 * Fica recolhido: abre sozinho quando já há recado salvo ou rascunho pendente.
 *
 * Salva só no botão: salvar sozinho enquanto alguém digita transformaria meia
 * frase em recado oficial. Texto vazio salvo apaga a observação.
 */
function ObservacaoCampo({ aula }: { aula: AulaExperimentalItem }) {
  const [salvo, setSalvo] = useState(aula.observacao ?? "");
  const [texto, setTextoEstado] = useState(() => rascunhosObservacao.get(aula.id) ?? aula.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const mudou = texto.trim() !== salvo.trim();
  const excedeu = texto.trim().length > OBSERVACAO_MAX;

  useEffect(() => {
    window.addEventListener("beforeunload", avisarSaida);
    return () => window.removeEventListener("beforeunload", avisarSaida);
  }, []);

  function setTexto(t: string) {
    setTextoEstado(t);
    if (t.trim() !== salvo.trim()) rascunhosObservacao.set(aula.id, t);
    else rascunhosObservacao.delete(aula.id);
  }

  function descartar() {
    rascunhosObservacao.delete(aula.id);
    setTextoEstado(salvo);
    setErro("");
  }

  async function salvar() {
    if (salvando || excedeu) return;
    setErro("");
    setSalvando(true);
    const res = await lerResultado(
      fetch(`/api/captacao/aulas/${aula.id}/observacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacao: texto }),
      }),
      ehAulaSalva,
      "Não deu para salvar a observação.",
    );
    setSalvando(false);
    if (res.tipo === "ok") {
      const gravado = res.dados.aula.observacao ?? "";
      rascunhosObservacao.delete(aula.id);
      setSalvo(gravado);
      setTextoEstado(gravado);
    } else {
      // O rascunho continua no campo para tentar de novo.
      setErro(res.tipo === "falha" ? res.erro : "Sem confirmação do servidor. Recarregue para ver o que ficou salvo.");
    }
  }

  return (
    <details open={Boolean(salvo) || mudou || undefined} className="group mt-3 pl-4">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="shrink-0 transition-transform duration-150 ease-padrao group-open:rotate-90"
        >
          <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Observação interna
        {salvo && !mudou && <span className="font-normal text-muted">· salva</span>}
        {mudou && <span className="font-normal text-warning">· não salva</span>}
      </summary>

      <label htmlFor={`obs-${aula.id}`} className="sr-only">
        Observação interna sobre a visita de {aula.nome}
      </label>
      <textarea
        id={`obs-${aula.id}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={OBSERVACAO_MAX}
        placeholder="Recado para quem receber essa pessoa — combinado de horário, quem vem junto, o que já foi falado."
        aria-describedby={`obs-${aula.id}-estado`}
        className={cn(classeCampo, "mt-1.5 resize-y bg-white")}
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span
          id={`obs-${aula.id}-estado`}
          className={cn("text-xs", excedeu ? "text-danger" : mudou ? "text-warning" : "text-muted")}
        >
          {mudou
            ? `${texto.trim().length}/${OBSERVACAO_MAX} · não salvo${!texto.trim() && salvo ? " (salvar vazio apaga a observação)" : ""}`
            : salvo
              ? "Salvo · não é enviado à pessoa"
              : `${texto.trim().length}/${OBSERVACAO_MAX} · não é enviado à pessoa`}
        </span>

        {mudou && (
          <span className="flex gap-2">
            <Botao variante="discreto" tamanho="sm" onClick={descartar} disabled={salvando}>
              Descartar
            </Botao>
            <Botao variante="contorno" tamanho="sm" onClick={() => void salvar()} carregando={salvando} disabled={excedeu}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
          </span>
        )}
      </div>
      {erro && <MensagemErro className="mt-1.5 text-xs">{erro}</MensagemErro>}
    </details>
  );
}
