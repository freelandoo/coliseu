"use client";

import { useEffect, useState } from "react";

type Estado =
  | "carregando"
  | "sem-suporte"
  | "ios-instalar"
  | "inativo"
  | "ativando"
  | "ativo"
  | "negado"
  | "indisponivel";

/** Chave VAPID base64url → bytes, formato que o pushManager.subscribe exige. */
function chaveParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  // Buffer explícito: o tipo de subscribe() exige ArrayBuffer, não ArrayBufferLike.
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function suportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS só libera push com o app instalado na tela inicial. */
function ehIosSemApp(): boolean {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalado =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return iOS && !instalado;
}

/**
 * Liga o aviso de mensagem nova neste aparelho (Web Push do PWA).
 * Com a permissão já dada, renova a inscrição no servidor a cada carga —
 * endpoints de push expiram e trocam sem avisar.
 */
export function AtivarNotificacoes() {
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    let ativo = true;
    // Fora do corpo síncrono do efeito: a regra react-hooks/set-state-in-effect
    // barra setState alcançável daqui — mesmo esquema do NotificationBell.
    const t = setTimeout(() => {
      void (async () => {
        if (!suportaPush()) {
          if (ativo) setEstado(ehIosSemApp() ? "ios-instalar" : "sem-suporte");
          return;
        }
        if (Notification.permission === "denied") {
          if (ativo) setEstado("negado");
          return;
        }
        try {
          const reg = await navigator.serviceWorker.ready;
          const inscricao = await reg.pushManager.getSubscription();
          if (!ativo) return;
          if (!inscricao) {
            setEstado("inativo");
            return;
          }
          // Renova no servidor sem bloquear a UI.
          void fetch("/api/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inscricao.toJSON()),
          }).catch(() => {});
          setEstado("ativo");
        } catch {
          if (ativo) setEstado("sem-suporte");
        }
      })();
    }, 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, []);

  async function ativar() {
    setEstado("ativando");
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado("negado");
        return;
      }
      const r = await fetch("/api/push");
      if (!r.ok) {
        setEstado("indisponivel");
        return;
      }
      const { publicKey } = (await r.json()) as { publicKey: string };
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(publicKey),
      });
      const salvo = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      setEstado(salvo.ok ? "ativo" : "indisponivel");
    } catch {
      setEstado("indisponivel");
    }
  }

  async function desativar() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.getSubscription();
      if (inscricao) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        }).catch(() => {});
        await inscricao.unsubscribe();
      }
    } finally {
      setEstado("inativo");
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;

  if (estado === "ios-instalar") {
    return (
      <p className="text-xs leading-snug text-faint">
        Para receber avisos no iPhone, instale o app: Compartilhar → “Adicionar à Tela de Início”.
      </p>
    );
  }

  if (estado === "negado") {
    return (
      <p className="text-xs leading-snug text-faint">
        Avisos bloqueados pelo navegador — libere as notificações nas permissões do site.
      </p>
    );
  }

  if (estado === "indisponivel") {
    return (
      <p className="text-xs leading-snug text-faint">
        Não deu para ativar os avisos agora. Tente de novo mais tarde.
      </p>
    );
  }

  if (estado === "ativo") {
    return (
      <p className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>Avisos de mensagem ativos neste aparelho.</span>
        <button
          onClick={() => void desativar()}
          className="shrink-0 font-medium text-faint transition-colors hover:text-ink"
        >
          Desativar
        </button>
      </p>
    );
  }

  return (
    <button
      onClick={() => void ativar()}
      disabled={estado === "ativando"}
      className="w-full rounded-lg border border-border-strong px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      {estado === "ativando" ? "Ativando…" : "🔔 Ativar avisos de mensagem neste aparelho"}
    </button>
  );
}
