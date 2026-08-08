"use client";

import { useEffect, useRef } from "react";
import { BATIMENTO_MS, OCIOSO_MS } from "@/lib/uso";

/**
 * O que conta como "tem gente aqui". Ficam de fora `mousemove` e `resize`: o
 * primeiro dispara com o gato passando no teclado e o segundo com a barra do
 * navegador do celular subindo sozinha — os dois manteriam a presença acesa
 * sem ninguém trabalhando.
 */
const EVENTOS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Batida de ponto do atendimento. A cada minuto avisa o servidor de que a
 * pessoa está aqui, e o servidor marca o bloco de cinco minutos em que a
 * batida caiu (ver `PresencaSlot` e `@/lib/uso`).
 *
 * Duas condições, e as duas importam: a aba tem de estar **visível** e tem de
 * ter havido **toque no aparelho** nos últimos cinco minutos. Sem elas, o
 * tablet esquecido ligado no balcão marcaria doze horas de trabalho durante a
 * noite, e o indicador de uso viraria um indicador de aba aberta.
 *
 * Mora no layout do app: presença é da pessoa logada, não da tela em que ela
 * está — quem passa a manhã na Cobrança está trabalhando igual.
 */
export function PresencaHeartbeat() {
  // Nasce em zero (ler o relógio durante a renderização é efeito colateral); o
  // efeito abaixo carimba a hora na montagem, que é quando a pessoa chegou.
  const ultimoToque = useRef(0);

  useEffect(() => {
    const marcarToque = () => {
      ultimoToque.current = Date.now();
    };
    marcarToque();
    for (const evento of EVENTOS) {
      window.addEventListener(evento, marcarToque, { passive: true });
    }

    const bater = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimoToque.current > OCIOSO_MS) return;
      // Falha de rede não tem tratamento: a batida do minuto seguinte cobre, e
      // um bloco perdido custa cinco minutos no relatório, não a sessão.
      void fetch("/api/presenca", { method: "POST", cache: "no-store" }).catch(() => {});
    };

    // Abrir (ou voltar para) a tela já é presença — trocar de aba é um toque.
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState !== "visible") return;
      marcarToque();
      bater();
    };
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);

    bater();
    const relogio = setInterval(bater, BATIMENTO_MS);

    return () => {
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
      for (const evento of EVENTOS) window.removeEventListener(evento, marcarToque);
    };
  }, []);

  return null;
}
