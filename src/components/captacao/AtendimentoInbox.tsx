"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { ConversaPainel } from "@/components/captacao/ConversaPainel";
import { cn } from "@/lib/cn";
import { INTERESSE_LABEL, type ConversaInteresse, type ConversaResumo } from "@/lib/types";

const POLL_LISTA_MS = 5_000;

const PONTO: Record<ConversaInteresse, string> = {
  nao_classificado: "bg-border-strong",
  com_interesse: "bg-red",
  sem_interesse: "bg-warn",
  perdido: "bg-border-strong",
  convertido: "bg-ok",
};

function quando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Inbox do WhatsApp: lista à esquerda, conversa à direita.
 * Atualiza por polling — uma recepção não justifica SSE nem WebSocket.
 */
export function AtendimentoInbox({
  inicial,
  conectado,
  podeResponder,
}: {
  inicial: ConversaResumo[];
  conectado: boolean;
  podeResponder: boolean;
}) {
  const [conversas, setConversas] = useState(inicial);
  const [selecionada, setSelecionada] = useState<string | null>(inicial[0]?.id ?? null);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/whatsapp/conversas", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { conversas: ConversaResumo[] };
        setConversas(d.conversas ?? []);
      } catch {
        /* rede instável: próxima volta resolve */
      }
    }, POLL_LISTA_MS);
    return () => clearInterval(t);
  }, []);

  // A conversa aberta some da lista só se for apagada; mantém a seleção viva.
  const atual = conversas.find((c) => c.id === selecionada) ?? null;

  function atualizarConversa(c: ConversaResumo) {
    setConversas((antigas) => antigas.map((a) => (a.id === c.id ? { ...a, ...c } : a)));
  }

  if (conversas.length === 0) {
    return (
      <Card className="px-5 py-16 text-center">
        <p className="text-sm text-faint">
          {conectado
            ? "Nenhuma conversa ainda. Quando alguém chamar no WhatsApp, o lead e o histórico aparecem aqui sozinhos."
            : "Conecte o WhatsApp para começar a receber conversas."}
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="max-h-[70dvh] overflow-y-auto">
        <ul>
          {conversas.map((c) => {
            const ativo = c.id === selecionada;
            return (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setSelecionada(c.id);
                    // abrir zera o badge; o servidor faz o mesmo no GET
                    setConversas((a) => a.map((x) => (x.id === c.id ? { ...x, naoLidas: 0 } : x)));
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0",
                    ativo ? "bg-red-ghost" : "hover:bg-surface-2",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PONTO[c.interesse])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{c.nome}</span>
                      <span className="shrink-0 text-[11px] text-faint">{quando(c.ultimaMensagemEm)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">{c.preview || c.telefone}</span>
                      {c.naoLidas > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-red px-1 text-[10px] font-semibold text-white">
                          {c.naoLidas}
                        </span>
                      )}
                    </span>
                    {c.interesse !== "nao_classificado" && (
                      <span className="mt-1 block text-[11px] uppercase tracking-wide text-faint">
                        {INTERESSE_LABEL[c.interesse]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="h-[70dvh] overflow-hidden">
        {atual ? (
          <ConversaPainel
            key={atual.id}
            conversa={atual}
            podeResponder={podeResponder && conectado}
            onConversaAtualizada={atualizarConversa}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-faint">
            Escolha uma conversa à esquerda.
          </p>
        )}
      </Card>
    </div>
  );
}
