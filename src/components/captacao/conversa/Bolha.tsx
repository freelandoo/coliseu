"use client";

import { useRef, useState, type TouchEvent } from "react";
import { cn } from "@/lib/cn";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";
import type { MensagemTela } from "@/lib/whatsapp/historico";
import type { CitacaoItem, MensagemItem } from "@/lib/types";
import { IconeCitar } from "@/components/captacao/icones";

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const ROTULOS = new Set(Object.values(ROTULO_MIDIA));

/**
 * Mídia buscada sob demanda: o Coliseu não guarda foto nem áudio de conversa,
 * pede à Evolution na hora de exibir. Imagem carrega quando entra na tela
 * (`lazy`); áudio e vídeo só ao dar play (`preload="none"`).
 *
 * Mídia antiga expira no WhatsApp; quando o download falha, a bolha volta a ser
 * o rótulo, em vez de um ícone quebrado.
 */
function Midia({ mensagem }: { mensagem: MensagemItem }) {
  const [falhou, setFalhou] = useState(false);
  const url = `/api/whatsapp/mensagens/${mensagem.id}/midia`;

  if (falhou) {
    return (
      <p className="text-xs text-muted">
        {mensagem.texto} · não foi possível carregar; veja pelo aparelho
      </p>
    );
  }

  if (mensagem.tipoMidia === "imagem") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* Binário servido pela nossa API; otimização do Next não se aplica. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={mensagem.texto} loading="lazy" onError={() => setFalhou(true)} className="max-h-64 rounded-lg" />
      </a>
    );
  }

  if (mensagem.tipoMidia === "audio") {
    return <audio controls preload="none" src={url} onError={() => setFalhou(true)} className="w-60 max-w-full" />;
  }

  if (mensagem.tipoMidia === "video") {
    return <video controls preload="none" src={url} onError={() => setFalhou(true)} className="max-h-64 rounded-lg" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-destaque hover:underline">
      📎 Abrir documento
    </a>
  );
}

/**
 * O trecho citado dentro da bolha. Vira botão quando a original ainda está na
 * conversa; citação de mensagem já apagada continua legível, só não leva a
 * lugar nenhum.
 */
function TrechoCitado({ citacao, onIrPara }: { citacao: CitacaoItem; onIrPara?: (id: string) => void }) {
  const cls = "mb-1.5 block w-full rounded-md border-l-2 border-brand bg-bg/60 px-2 py-1 text-left";
  const conteudo = (
    <>
      {citacao.autor && <span className="block text-xs font-semibold text-destaque">{citacao.autor}</span>}
      <span className="line-clamp-2 break-words text-xs text-muted">{citacao.texto || "Mensagem"}</span>
    </>
  );

  const alvo = citacao.id;
  if (!alvo || !onIrPara) return <div className={cls}>{conteudo}</div>;
  return (
    <button
      type="button"
      onClick={() => onIrPara(alvo)}
      title="Ir para a mensagem citada"
      className={cn(cls, "transition-colors hover:bg-bg")}
    >
      {conteudo}
    </button>
  );
}

/** Arrastar do lado: onde começa a valer, o gatilho, e o quanto a bolha anda. */
const ARRASTO = { minimo: 8, gatilho: 48, teto: 72 };

/**
 * O que a bolha de saída diz sobre o envio. Só o que se sabe: o servidor não
 * informa entrega nem leitura no aparelho, então não há "entregue" nem "lida".
 */
function estadoEnvio(m: MensagemTela): { texto: string; tom: "neutro" | "falha" | "incerto" } | null {
  if (m.envio === "enviando") return { texto: "enviando…", tom: "neutro" };
  if (m.envio === "incerto") return { texto: "sem confirmação", tom: "incerto" };
  if (m.envio === "falhou" || m.erro) return { texto: "falha no envio", tom: "falha" };
  return null;
}

export function Bolha({
  mensagem,
  destacada,
  onCitar,
  onIrPara,
  onRecolocar,
}: {
  mensagem: MensagemTela;
  destacada?: boolean;
  /** Ausente quando o perfil não responde — quem só lê não cita. */
  onCitar?: () => void;
  onIrPara?: (id: string) => void;
  /** Presente quando a caixa está vazia: o texto que não saiu pode voltar para ela. */
  onRecolocar?: () => void;
}) {
  const saida = mensagem.direcao === "OUT";
  const temMidia = mensagem.tipoMidia !== "texto" && !mensagem.erro;
  const legenda = temMidia && ROTULOS.has(mensagem.texto) ? "" : mensagem.texto;
  const podeCitar = !!onCitar && mensagem.citavel;
  const estado = saida ? estadoEnvio(mensagem) : null;
  const podeRecolocar = !!onRecolocar && !!estado && estado.tom !== "neutro" && mensagem.tipoMidia === "texto";

  const [arrasto, setArrasto] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);

  function aoTocar(e: TouchEvent) {
    if (!podeCitar) return;
    const t = e.touches[0];
    inicio.current = { x: t.clientX, y: t.clientY };
    horizontal.current = false;
  }

  function aoMover(e: TouchEvent) {
    const p = inicio.current;
    if (!p) return;
    const t = e.touches[0];
    const dx = t.clientX - p.x;
    const dy = t.clientY - p.y;
    if (!horizontal.current) {
      if (Math.abs(dx) < ARRASTO.minimo) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        inicio.current = null;
        return;
      }
      horizontal.current = true;
      setArrastando(true);
    }
    setArrasto(Math.max(0, Math.min(dx, ARRASTO.teto)));
  }

  function encerrar(citar: boolean) {
    if (citar && horizontal.current && arrasto >= ARRASTO.gatilho) onCitar?.();
    inicio.current = null;
    horizontal.current = false;
    setArrastando(false);
    setArrasto(0);
  }

  return (
    <div id={`msg-${mensagem.id}`} className={cn("group relative flex", saida ? "justify-end" : "justify-start")}>
      {arrasto > 0 && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 -translate-y-1/2 text-destaque"
          style={{ opacity: Math.min(1, arrasto / ARRASTO.gatilho) }}
        >
          <IconeCitar tamanho={16} />
        </span>
      )}
      <div
        onTouchStart={aoTocar}
        onTouchMove={aoMover}
        onTouchEnd={() => encerrar(true)}
        onTouchCancel={() => encerrar(false)}
        style={{
          transform: arrasto ? `translateX(${arrasto}px)` : undefined,
          transition: arrastando ? "none" : "transform 150ms ease-out",
          touchAction: podeCitar ? "pan-y" : undefined,
        }}
        className={cn(
          "relative max-w-[85%] rounded-xl border px-3.5 py-2 sm:max-w-[75%]",
          saida ? "border-brand/25 bg-brand-soft" : "border-border bg-surface-2",
          estado?.tom === "falha" && "border-danger/50",
          estado?.tom === "incerto" && "border-warning/50",
          mensagem.envio === "enviando" && "opacity-75",
          destacada && "ring-2 ring-brand",
        )}
      >
        {podeCitar && (
          <button
            type="button"
            onClick={onCitar}
            title="Citar esta mensagem"
            aria-label="Citar esta mensagem"
            className={cn(
              "absolute -top-2 hidden rounded-full border border-border bg-surface p-1 text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 lg:block",
              saida ? "-left-2" : "-right-2",
            )}
          >
            <IconeCitar tamanho={13} />
          </button>
        )}
        {mensagem.citada && <TrechoCitado citacao={mensagem.citada} onIrPara={onIrPara} />}
        {/* Em grupo, quem falou importa tanto quanto o que foi dito. */}
        {!saida && mensagem.remetente && (
          <p className="mb-0.5 text-xs font-semibold text-destaque">{mensagem.remetente}</p>
        )}
        {temMidia && (
          <div className={cn(legenda && "mb-1.5")}>
            <Midia mensagem={mensagem} />
          </div>
        )}
        {legenda && <p className="whitespace-pre-wrap break-words text-sm text-ink">{legenda}</p>}
        <p className="mt-1 text-right text-xs text-muted">
          {saida && (mensagem.autorNome ?? (mensagem.envio ? "você" : "pelo aparelho"))}
          {saida && " · "}
          {hora(mensagem.enviadaEm)}
          {estado && (
            <span
              className={cn(
                estado.tom === "falha" && "font-medium text-danger",
                estado.tom === "incerto" && "font-medium text-warning",
              )}
            >
              {" · "}
              {estado.texto}
            </span>
          )}
        </p>
        {estado?.tom === "falha" && mensagem.erro && (
          <p className="mt-0.5 text-right text-xs text-danger">{mensagem.erro}</p>
        )}
        {podeRecolocar && (
          <div className="mt-1 text-right">
            <button type="button" onClick={onRecolocar} className="text-xs font-semibold text-destaque hover:underline">
              Recolocar texto na caixa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
