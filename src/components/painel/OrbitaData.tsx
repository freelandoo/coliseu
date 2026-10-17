"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CONSULTA_MOVIMENTO_REDUZIDO } from "@/lib/movimento";

function assinarReduzido(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/**
 * Órbita da abertura: PURA DECORAÇÃO ao lado da data. Os arcos não medem
 * nada — nem progresso, nem saúde, nem meta.
 *
 * Gira devagar (28s por volta), para sozinha quando a aba fica oculta e pode
 * ser pausada pelo botão. Em movimento reduzido nem gira nem mostra o botão.
 */
export function OrbitaData({ dia, mesAno }: { dia: string; mesAno: string }) {
  const [pausada, setPausada] = useState(false);
  const [oculta, setOculta] = useState(false);
  const reduzido = useSyncExternalStore(
    assinarReduzido,
    () => window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO).matches,
    () => false,
  );

  useEffect(() => {
    const aoMudar = () => setOculta(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, []);

  const parada = pausada || oculta || reduzido;

  return (
    <div className="flex flex-col items-center gap-1" data-orbita={parada ? "parada" : "girando"}>
      <div aria-hidden className="relative grid h-[118px] w-[104px] place-items-center sm:h-[190px] sm:w-[210px]">
        {/* esfera */}
        <span className="absolute h-[80px] w-[80px] rounded-full border border-[#edb1c3]/25 bg-[radial-gradient(ellipse_at_30%_20%,rgb(193_92_124/0.22),rgb(62_12_27/0.32)_70%)] shadow-[inset_-10px_-12px_32px_rgb(31_7_17/0.35)] sm:h-[132px] sm:w-[132px]" />
        {/* arcos */}
        <span className="absolute h-[108px] w-[108px] rotate-[-25deg] scale-y-[0.76] rounded-full border border-[#d9a3b3]/20 sm:h-[180px] sm:w-[180px]">
          <span className="orbita-giro absolute -inset-px rounded-full">
            <span className="absolute left-[18px] top-[8px] h-1.5 w-1.5 rounded-full bg-[#f1a1b9] shadow-[0_0_0_5px_rgb(221_109_145/0.08)] sm:left-[33px] sm:top-[15px]" />
          </span>
        </span>
        <span className="absolute h-[122px] w-[122px] rotate-[35deg] scale-y-[0.76] rounded-full border border-[#d9a3b3]/10 sm:h-[205px] sm:w-[205px]" />
        <span className="relative text-center">
          <span className="block font-display text-4xl font-medium leading-none tracking-[-0.02em] text-ink sm:text-6xl">
            {dia}
          </span>
          <span className="mt-1.5 block text-xs tracking-[0.16em] text-muted">{mesAno}</span>
        </span>
      </div>
      {!reduzido && (
        <button
          type="button"
          onClick={() => setPausada((p) => !p)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <span aria-hidden className={pausada ? "h-1.5 w-1.5 rounded-full bg-faint" : "h-1.5 w-1.5 rounded-full bg-destaque"} />
          {pausada ? "Retomar movimento" : "Pausar movimento"}
        </button>
      )}
    </div>
  );
}
