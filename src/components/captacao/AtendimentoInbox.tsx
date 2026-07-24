"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { ConversaPainel } from "@/components/captacao/ConversaPainel";
import { cn } from "@/lib/cn";
import { INTERESSE_LABEL, type ConversaInteresse, type ConversaResumo } from "@/lib/types";

const POLL_LISTA_MS = 5_000;

/** Rótulo do grupo enquanto o assunto não chega da Evolution — ver `toResumo`. */
const GRUPO_SEM_NOME = "Grupo do WhatsApp";

type Aba = "pessoas" | "grupos";

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

function somaNaoLidas(lista: ConversaResumo[]) {
  return lista.reduce((total, c) => total + c.naoLidas, 0);
}

/**
 * Abas Pessoas/Grupos. Grupo costuma falar muito mais que lead: sem separar, a
 * conversa de quem quer matrícula afundaria embaixo da conversa de grupo.
 */
function AbaBotao({
  ativa,
  label,
  quantidade,
  naoLidas,
  onClick,
}: {
  ativa: boolean;
  label: string;
  quantidade: number;
  naoLidas: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 font-display text-[11px] font-semibold uppercase tracking-widest transition-colors",
        ativa ? "border-b-2 border-red bg-red-ghost text-ink" : "text-faint hover:text-muted",
      )}
    >
      {label}
      <span className="text-[11px] font-normal tracking-normal text-faint">{quantidade}</span>
      {naoLidas > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded bg-red px-1 text-[10px] font-semibold tracking-normal text-white">
          {naoLidas}
        </span>
      )}
    </button>
  );
}

/**
 * Inbox do WhatsApp: lista à esquerda, conversa à direita.
 * Atualiza por polling — uma recepção não justifica SSE nem WebSocket.
 */
export function AtendimentoInbox({
  inicial,
  conectado,
  podeResponder,
  podeApagar,
}: {
  inicial: ConversaResumo[];
  conectado: boolean;
  podeResponder: boolean;
  podeApagar: boolean;
}) {
  // `?c=<id>` vem do link "Responder" da tabela de leads e do aviso de login.
  const alvo = useSearchParams().get("c");
  const [conversas, setConversas] = useState(inicial);
  const inicialSelecionada = alvo && inicial.some((c) => c.id === alvo) ? alvo : null;
  const [aba, setAba] = useState<Aba>(
    inicial.find((c) => c.id === inicialSelecionada)?.ehGrupo ? "grupos" : "pessoas",
  );
  const [selecionada, setSelecionada] = useState<string | null>(
    inicialSelecionada ?? inicial.find((c) => !c.ehGrupo)?.id ?? inicial[0]?.id ?? null,
  );

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

  // Grupo entra pelo webhook sem o assunto — a mensagem só traz o nome de quem
  // escreveu. Ao ver grupo sem nome, pede o título à Evolution uma vez; o
  // servidor tem janela própria, então tela reaberta não vira martelo.
  const faltaNome = conversas.some((c) => c.ehGrupo && c.nome === GRUPO_SEM_NOME);
  useEffect(() => {
    if (!faltaNome) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/whatsapp/grupos", { method: "POST" });
        const d = (await r.json().catch(() => ({}))) as { renomeados?: number };
        if (!ativo || !d.renomeados) return;
        const lista = await fetch("/api/whatsapp/conversas", { cache: "no-store" });
        if (!lista.ok || !ativo) return;
        const dados = (await lista.json()) as { conversas: ConversaResumo[] };
        if (ativo) setConversas(dados.conversas ?? []);
      } catch {
        /* sem nome do grupo a inbox continua funcionando */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [faltaNome]);

  const pessoas = conversas.filter((c) => !c.ehGrupo);
  const grupos = conversas.filter((c) => c.ehGrupo);
  const visiveis = aba === "grupos" ? grupos : pessoas;

  function trocarAba(nova: Aba) {
    setAba(nova);
    const lista = nova === "grupos" ? grupos : pessoas;
    // Sem isso a conversa aberta continuaria à direita fora da aba escolhida.
    if (!lista.some((c) => c.id === selecionada)) setSelecionada(lista[0]?.id ?? null);
  }

  // A conversa aberta some da lista só se for apagada; mantém a seleção viva.
  const atual = conversas.find((c) => c.id === selecionada) ?? null;

  function atualizarConversa(c: ConversaResumo) {
    setConversas((antigas) => antigas.map((a) => (a.id === c.id ? { ...a, ...c } : a)));
  }

  function removerConversa(id: string) {
    const restantes = conversas.filter((a) => a.id !== id);
    setConversas(restantes);
    setSelecionada((atual) => (atual === id ? (restantes[0]?.id ?? null) : atual));
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
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden">
        <div className="flex shrink-0 border-b border-border">
          <AbaBotao
            ativa={aba === "pessoas"}
            label="Pessoas"
            quantidade={pessoas.length}
            naoLidas={somaNaoLidas(pessoas)}
            onClick={() => trocarAba("pessoas")}
          />
          <AbaBotao
            ativa={aba === "grupos"}
            label="Grupos"
            quantidade={grupos.length}
            naoLidas={somaNaoLidas(grupos)}
            onClick={() => trocarAba("grupos")}
          />
        </div>

        <ul className="flex-1 overflow-y-auto">
          {visiveis.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-faint">
              {aba === "grupos"
                ? "Nenhum grupo por aqui ainda. O grupo entra nesta aba na primeira mensagem nova que chegar nele — conversa anterior não é importada."
                : "Nenhuma conversa individual ainda."}
            </li>
          )}
          {visiveis.map((c) => {
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
                    "flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0",
                    ativo ? "bg-red-ghost" : "hover:bg-surface-2",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PONTO[c.interesse])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{c.nome}</span>
                      <span className="shrink-0 text-[11px] text-faint">{quando(c.ultimaMensagemEm)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted">{c.preview || c.telefone}</span>
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

      <Card className="h-[calc(100dvh-8rem)] overflow-hidden">
        {atual ? (
          <ConversaPainel
            key={atual.id}
            conversa={atual}
            podeResponder={podeResponder}
            podeApagar={podeApagar}
            onConversaAtualizada={atualizarConversa}
            onConversaRemovida={removerConversa}
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
