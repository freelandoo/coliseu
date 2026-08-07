"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatarDataCompleta, formatarHora, OBSERVACAO_MAX } from "@/lib/aula-experimental";
import {
  agruparPorData,
  gradeDoMes,
  INICIAIS_SEMANA,
  mesDaData,
  mesDeslocado,
  rotuloMes,
  semanasDoMes,
} from "@/lib/calendario";
import type { AulaExperimentalItem } from "@/lib/types";

/**
 * A agenda da Captação vista como mês.
 *
 * A lista de aulas responde "quem vem hoje?"; o calendário responde a outra
 * pergunta, a de quem está marcando: "que dias já estão cheios?". Por isso o
 * dia com aula é vermelho na grade — a recepção enxerga o mês inteiro de uma
 * vez e escolhe o horário olhando para ele, sem abrir dia por dia.
 *
 * Clicar num dia abre embaixo tudo que está marcado nele, com o campo de
 * observação de cada visita. `hoje` vem pronto do servidor, no relógio da
 * academia — calcular aqui faria servidor e navegador discordarem sobre que dia
 * é hoje (e o círculo do "hoje" cairia no dia errado à noite).
 */
export function CalendarioAulas({
  aulas,
  hoje,
}: {
  aulas: AulaExperimentalItem[];
  hoje: string;
}) {
  const [ancora, setAncora] = useState(() => mesDaData(hoje));
  const [selecionado, setSelecionado] = useState(hoje);

  const gradeRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  /** Para onde o mês andou: o título entra pelo lado de onde veio. */
  const direcao = useRef(0);

  const porData = useMemo(() => agruparPorData(aulas), [aulas]);
  const dias = useMemo(() => gradeDoMes(ancora.ano, ancora.mes), [ancora]);
  const semanas = semanasDoMes(ancora.ano, ancora.mes);
  const doDia = porData.get(selecionado) ?? [];

  const noMes = useMemo(
    () => aulas.filter((a) => mesmoMes(a.data, ancora.ano, ancora.mes)).length,
    [aulas, ancora],
  );

  // A grade se refaz a cada mês: as células entram em cascata na diagonal, o
  // que dá ao usuário o sentido de "página nova" sem piscar a tela.
  useGSAP(
    () => {
      gsap.from("[data-dia]", {
        opacity: 0,
        y: 8,
        duration: 0.3,
        ease: "power2.out",
        stagger: { each: 0.012, grid: [semanas, 7], from: "start" },
      });
      gsap.from("[data-mes-rotulo]", {
        opacity: 0,
        x: direcao.current * 14,
        duration: 0.35,
        ease: "power3.out",
      });
    },
    { scope: gradeRef, dependencies: [ancora.ano, ancora.mes], revertOnUpdate: true },
  );

  // A marca do dia escolhido cresce no lugar — é o retorno visual do clique,
  // separado da entrada do mês para não reanimar a grade inteira a cada dia.
  useGSAP(
    () => {
      gsap.fromTo(
        "[data-marca-selecao]",
        { scale: 0.7, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.2)" },
      );
    },
    { scope: gradeRef, dependencies: [selecionado], revertOnUpdate: true },
  );

  useGSAP(
    () => {
      gsap.from("[data-agendamento]", {
        opacity: 0,
        y: 12,
        duration: 0.4,
        ease: "power3.out",
        stagger: 0.06,
      });
    },
    { scope: listaRef, dependencies: [selecionado], revertOnUpdate: true },
  );

  function andarMes(passo: number) {
    direcao.current = passo;
    setAncora((a) => mesDeslocado(a.ano, a.mes, passo));
  }

  function escolherDia(data: string) {
    const alvo = mesDaData(data);
    if (alvo.ano !== ancora.ano || alvo.mes !== ancora.mes) {
      // Clicou numa sobra do mês vizinho: a grade acompanha o dia escolhido.
      direcao.current = data > selecionado ? 1 : -1;
      setAncora(alvo);
    }
    setSelecionado(data);
  }

  function voltarParaHoje() {
    const alvo = mesDaData(hoje);
    direcao.current = alvo.ano * 12 + alvo.mes >= ancora.ano * 12 + ancora.mes ? 1 : -1;
    setAncora(alvo);
    setSelecionado(hoje);
  }

  const foraDeHoje = selecionado !== hoje || !mesmoMes(hoje, ancora.ano, ancora.mes);

  return (
    <div className="flex flex-col gap-5">
      <Card className="mx-auto w-full max-w-md p-4 sm:p-5">
        <div ref={gradeRef}>
          <div className="flex items-center justify-between gap-2">
            <SetaMes direcao={-1} onClick={() => andarMes(-1)} />
            <div className="min-w-0 text-center">
              <p
                data-mes-rotulo
                className="truncate font-display text-base font-semibold uppercase tracking-widest text-ink sm:text-lg"
              >
                {rotuloMes(ancora.ano, ancora.mes)}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">
                {noMes === 0
                  ? "nenhuma aula marcada"
                  : `${noMes} aula${noMes > 1 ? "s" : ""} marcada${noMes > 1 ? "s" : ""}`}
              </p>
            </div>
            <SetaMes direcao={1} onClick={() => andarMes(1)} />
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1">
            {INICIAIS_SEMANA.map((inicial, i) => (
              <span
                key={i}
                aria-hidden
                className="pb-1 text-center text-[11px] font-semibold uppercase tracking-widest text-faint"
              >
                {inicial}
              </span>
            ))}

            {dias.map((d) => {
              const marcadas = porData.get(d.data)?.length ?? 0;
              const ehSelecionado = d.data === selecionado;
              const ehHoje = d.data === hoje;
              return (
                <button
                  key={d.data}
                  data-dia
                  type="button"
                  onClick={() => escolherDia(d.data)}
                  aria-pressed={ehSelecionado}
                  aria-label={`${formatarDataCompleta(d.data)}${
                    marcadas > 0 ? ` · ${marcadas} aula${marcadas > 1 ? "s" : ""}` : ""
                  }`}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-lg text-sm transition-colors",
                    !d.doMes && "opacity-40",
                    ehSelecionado
                      ? "text-white"
                      : marcadas > 0
                        ? "font-semibold text-red-bright hover:bg-red-ghost"
                        : "text-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {ehSelecionado && (
                    <span
                      data-marca-selecao
                      aria-hidden
                      className={cn(
                        "absolute inset-0.5 rounded-full",
                        marcadas > 0
                          ? "bg-red shadow-[var(--shadow-red)]"
                          : "bg-elevated ring-1 ring-border-strong",
                      )}
                    />
                  )}
                  {!ehSelecionado && ehHoje && (
                    <span
                      aria-hidden
                      className="absolute inset-0.5 rounded-full ring-1 ring-border-strong"
                    />
                  )}
                  <span className="relative">{d.dia}</span>
                  {marcadas > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute bottom-1 h-1 w-1 rounded-full",
                        ehSelecionado ? "bg-white/80" : "bg-red-bright",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {foraDeHoje && (
          <button
            type="button"
            onClick={voltarParaHoje}
            className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            Voltar para hoje
          </button>
        )}
      </Card>

      <div ref={listaRef} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
            {selecionado === hoje ? "Hoje" : formatarDataCompleta(selecionado)}
          </h2>
          <span className="text-xs text-faint">
            {doDia.length === 0
              ? "nada marcado"
              : `${doDia.length} agendamento${doDia.length > 1 ? "s" : ""}`}
          </span>
        </div>

        {doDia.length === 0 ? (
          <Card data-agendamento className="px-5 py-8 text-center">
            <p className="text-sm text-faint">
              Nenhuma aula experimental marcada para {formatarDataCompleta(selecionado)}.
            </p>
            <p className="mt-1 text-xs text-faint">
              Marcar é pela conversa do WhatsApp, no retrátil em cima da caixa de texto.
            </p>
          </Card>
        ) : (
          [...doDia]
            .sort((a, b) => a.hora - b.hora)
            .map((aula) => <LinhaDoDia key={aula.id} aula={aula} />)
        )}
      </div>
    </div>
  );
}

function mesmoMes(data: string, ano: number, mes: number): boolean {
  const m = mesDaData(data);
  return m.ano === ano && m.mes === mes;
}

function SetaMes({ direcao, onClick }: { direcao: -1 | 1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direcao === -1 ? "Mês anterior" : "Próximo mês"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-ink"
    >
      {direcao === -1 ? "‹" : "›"}
    </button>
  );
}

/** Um agendamento do dia escolhido, com o recado da recepção logo abaixo. */
function LinhaDoDia({ aula }: { aula: AulaExperimentalItem }) {
  return (
    <Card data-agendamento className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{aula.nome}</p>
          <p className="text-xs text-muted">{aula.telefone}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-display text-sm font-semibold tracking-widest text-red-bright">
            {formatarHora(aula.hora)}
          </span>
          <Badge>{aula.modalidade}</Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-faint">
          Marcada por {aula.agendadoPor ?? "—"}
        </span>
        {aula.conversaId && (
          <Link
            href={`/atendimento?c=${aula.conversaId}`}
            className="text-xs font-medium text-red-bright hover:underline"
          >
            Conversa →
          </Link>
        )}
      </div>

      <ObservacaoCampo aula={aula} />
    </Card>
  );
}

/**
 * O campo de observação da visita.
 *
 * Salva só no botão, e o botão só existe quando há mudança: o balcão é um lugar
 * de clique torto, e salvar sozinho enquanto alguém digita transformaria meia
 * frase em recado oficial. O rascunho vive no próprio campo — sair da tela sem
 * salvar não grava nada, e é isso que o texto embaixo avisa.
 */
function ObservacaoCampo({ aula }: { aula: AulaExperimentalItem }) {
  const [texto, setTexto] = useState(aula.observacao ?? "");
  const [salvo, setSalvo] = useState(aula.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const mudou = texto.trim() !== salvo.trim();
  const excedeu = texto.trim().length > OBSERVACAO_MAX;

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      const r = await fetch(`/api/captacao/aulas/${aula.id}/observacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacao: texto }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        setErro(d?.erro ?? "Não deu para salvar a observação.");
        return;
      }
      const d = (await r.json()) as { aula: AulaExperimentalItem };
      const gravado = d.aula.observacao ?? "";
      setSalvo(gravado);
      setTexto(gravado);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <label
        htmlFor={`obs-${aula.id}`}
        className="text-[11px] font-semibold uppercase tracking-widest text-faint"
      >
        Observações
      </label>
      <textarea
        id={`obs-${aula.id}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={OBSERVACAO_MAX}
        placeholder="Recado para quem receber essa pessoa — combinado de horário, quem vem junto, o que já foi falado."
        className="mt-1.5 w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-border-strong focus:outline-none"
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={cn("text-[11px]", excedeu ? "text-red-bright" : "text-faint")}>
          {erro
            ? ""
            : mudou
              ? `${texto.trim().length}/${OBSERVACAO_MAX} · não salvo`
              : salvo
                ? "salvo"
                : `${texto.trim().length}/${OBSERVACAO_MAX}`}
        </span>
        {erro && <span className="text-[11px] text-red-bright">{erro}</span>}

        {mudou && (
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || excedeu}
            className="rounded-lg border border-red/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-red-bright transition-colors hover:bg-red-ghost disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        )}
      </div>
    </div>
  );
}
