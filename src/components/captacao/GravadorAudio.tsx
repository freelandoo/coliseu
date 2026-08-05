"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import {
  duracao,
  escolherFormato,
  extensaoDoFormato,
  LIMITE_GRAVACAO_S,
} from "@/lib/whatsapp/gravacao";

/**
 * Gravação de mensagem de voz na conversa.
 *
 * Grava por toque, e não por "segurar o botão": a recepção fala enquanto atende
 * outra pessoa no balcão, e prender o dedo na tela por um minuto não é o que
 * acontece na vida real. O preço é precisar de uma saída explícita — daí a
 * lixeira ao lado do enviar, que descarta sem mandar nada.
 *
 * O áudio nunca fica no Coliseu: vai direto para o WhatsApp e some da memória
 * do navegador. É a mesma regra da mídia recebida, que é buscada na Evolution
 * na hora de tocar.
 */
export function GravadorAudio({
  desabilitado,
  onEstado,
  onGravado,
  onErro,
}: {
  desabilitado: boolean;
  /** Avisa o painel para esconder a caixa de texto enquanto grava. */
  onEstado: (gravando: boolean) => void;
  onGravado: (audio: File) => void | Promise<void>;
  onErro: (mensagem: string) => void;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const descartar = useRef(false);

  // Suporte só se sabe no cliente: navegador antigo, ou página servida sem
  // HTTPS, não tem `MediaRecorder` nem microfone. O servidor não pode adivinhar
  // isso, então o snapshot dele é "não tem" e o botão aparece na hidratação —
  // é para isso que serve o terceiro argumento aqui, e é o que evita a marca
  // d'água de HTML divergente.
  const disponivel = useSyncExternalStore(
    () => () => {}, // não muda enquanto a página está aberta: nada a assinar
    () =>
      typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );

  // Contador da bolinha vermelha, e o teto de duração: passou do limite, a
  // gravação se fecha sozinha e fica pronta para enviar — o que já foi falado
  // não se perde.
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= LIMITE_GRAVACAO_S) gravador.current?.stop();
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [gravando]);

  // Sair da conversa no meio da gravação solta o microfone: sem isto, a luz da
  // câmera/mic do aparelho continuaria acesa depois de trocar de tela.
  useEffect(() => {
    return () => {
      const g = gravador.current;
      if (g && g.state !== "inactive") {
        descartar.current = true;
        g.stop();
      }
    };
  }, []);

  const iniciar = useCallback(async () => {
    if (gravando || desabilitado) return;
    let trilha: MediaStream;
    try {
      trilha = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onErro("Sem acesso ao microfone. Permita o uso nas configurações do navegador.");
      return;
    }

    const formato = escolherFormato((m) => MediaRecorder.isTypeSupported(m));
    const g = new MediaRecorder(trilha, formato ? { mimeType: formato } : undefined);
    gravador.current = g;
    pedacos.current = [];
    descartar.current = false;

    g.ondataavailable = (e) => {
      if (e.data.size > 0) pedacos.current.push(e.data);
    };
    g.onstop = () => {
      // Soltar o microfone antes de qualquer coisa: o envio pode falhar, o
      // aparelho não pode ficar gravando por causa disso.
      trilha.getTracks().forEach((t) => t.stop());
      gravador.current = null;
      setGravando(false);
      onEstado(false);
      setSegundos(0);

      const partes = pedacos.current;
      pedacos.current = [];
      if (descartar.current || partes.length === 0) return;

      const mime = g.mimeType || formato || "audio/webm";
      const blob = new Blob(partes, { type: mime });
      if (blob.size === 0) return;
      void onGravado(
        new File([blob], `audio-${Date.now()}.${extensaoDoFormato(mime)}`, { type: mime }),
      );
    };

    g.start();
    setSegundos(0);
    setGravando(true);
    onEstado(true);
  }, [desabilitado, gravando, onErro, onEstado, onGravado]);

  function encerrar(manter: boolean) {
    descartar.current = !manter;
    gravador.current?.stop();
  }

  if (!disponivel) return null;

  if (!gravando) {
    return (
      <button
        type="button"
        onClick={() => void iniciar()}
        disabled={desabilitado}
        title="Gravar mensagem de voz"
        aria-label="Gravar mensagem de voz"
        className={cn(
          "shrink-0 self-end rounded-lg border border-border p-2.5 text-muted transition-colors hover:text-ink",
          desabilitado && "cursor-not-allowed opacity-50",
        )}
      >
        <IconeMicrofone />
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-3 self-end rounded-lg border border-red/60 bg-red-ghost px-3 py-2">
      <button
        type="button"
        onClick={() => encerrar(false)}
        title="Descartar"
        aria-label="Descartar gravação"
        className="shrink-0 text-muted transition-colors hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>

      <span className="flex flex-1 items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-bright" aria-hidden />
        <span className="font-mono text-sm text-ink" aria-live="off">
          {duracao(segundos)}
        </span>
        <span className="text-[11px] font-light text-faint">gravando…</span>
      </span>

      <button
        type="button"
        onClick={() => encerrar(true)}
        title="Enviar áudio"
        aria-label="Enviar áudio"
        className="shrink-0 rounded-lg bg-red p-2 text-white transition-colors hover:bg-red-bright"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </div>
  );
}

function IconeMicrofone() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}
