"use client";

import { useEffect, useState } from "react";

// Evento não-padronizado do Chrome/Android. Tipado localmente.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CHAVE_DISPENSA = "coliseu:pwa-install-dispensado";
const DIAS_DISPENSA = 14;

function dispensadoRecentemente(): boolean {
  try {
    const em = localStorage.getItem(CHAVE_DISPENSA);
    if (!em) return false;
    return Date.now() - Number(em) < DIAS_DISPENSA * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function estaInstalado(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function ehIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const naoChromeOuFirefox = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && naoChromeOuFirefox;
}

const IconCompartilhar = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="inline align-text-bottom">
    <path d="M7 9V1.5M7 1.5L4.5 4M7 1.5L9.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 6H2v6.5h10V6h-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const IconMais = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden className="inline align-text-bottom">
    <rect x="0.7" y="0.7" width="11.6" height="11.6" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M6.5 4v5M4 6.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/**
 * Registra o service worker e oferece o convite de instalação ("Adicionar à
 * tela inicial"). Em Android/Chrome usa o evento beforeinstallprompt; em iOS
 * Safari mostra a dica manual (Compartilhar → Adicionar à Tela de Início).
 */
export function InstallPrompt() {
  const [pendente, setPendente] = useState<BeforeInstallPromptEvent | null>(null);
  const [modo, setModo] = useState<"nenhum" | "android" | "ios">("nenhum");

  // Registro do service worker.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const aoCarregar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") aoCarregar();
    else window.addEventListener("load", aoCarregar);
    return () => window.removeEventListener("load", aoCarregar);
  }, []);

  // Detecção do convite de instalação.
  useEffect(() => {
    if (estaInstalado() || dispensadoRecentemente()) return;

    const aoBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPendente(e as BeforeInstallPromptEvent);
      setModo("android");
    };
    window.addEventListener("beforeinstallprompt", aoBeforeInstall);

    // iOS não dispara beforeinstallprompt — mostra a dica manual após um tempo.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (ehIosSafari()) {
      iosTimer = setTimeout(() => {
        setModo((m) => (m === "nenhum" ? "ios" : m));
      }, 4000);
    }

    const aoInstalar = () => {
      setModo("nenhum");
      setPendente(null);
    };
    window.addEventListener("appinstalled", aoInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", aoBeforeInstall);
      window.removeEventListener("appinstalled", aoInstalar);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dispensar = () => {
    try {
      localStorage.setItem(CHAVE_DISPENSA, String(Date.now()));
    } catch {
      /* ignora */
    }
    setModo("nenhum");
  };

  const instalar = async () => {
    if (!pendente) return;
    await pendente.prompt();
    await pendente.userChoice;
    setPendente(null);
    setModo("nenhum");
  };

  if (modo === "nenhum") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="Coliseu" className="h-10 w-10 shrink-0 rounded-xl border border-border" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
            Instalar o Coliseu
          </p>
          {modo === "android" ? (
            <p className="text-xs leading-snug text-muted">
              Adicione o app à sua tela inicial — abre rápido e em tela cheia.
            </p>
          ) : (
            <p className="text-xs leading-snug text-muted">
              Toque em <span className="font-semibold text-ink">Compartilhar</span> {IconCompartilhar} e
              depois em <span className="font-semibold text-ink">“Adicionar à Tela de Início”</span> {IconMais}.
            </p>
          )}
        </div>
        {modo === "android" ? (
          <button
            onClick={instalar}
            className="shrink-0 rounded-lg bg-red px-3.5 py-2 font-display text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-bright"
          >
            Instalar
          </button>
        ) : null}
        <button
          onClick={dispensar}
          aria-label="Fechar"
          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
