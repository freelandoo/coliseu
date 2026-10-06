"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import { AtivarNotificacoes } from "@/components/pwa/AtivarNotificacoes";

interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  url: string | null;
  lidaEm: string | null;
  createdAt: string;
}

interface LeadNovo {
  id: string;
  nome: string;
  telefone: string;
  conversaId?: string;
}

// Fora de evento, segura o refetch por 60s — foco/visibilidade disparam à
// vontade e o sino não vira um poll disfarçado.
const INTERVALO_MINIMO_MS = 60 * 1000;

/**
 * Sininho de notificações (badge de leads não trabalhados + dropdown com
 * atalho pra responder). Para admins, também os avisos financeiros (estorno,
 * chargeback) — esses ficam guardados e saem da contagem ao abrir o sino. O contador atualiza ao focar a aba e na hora em que
 * chega mensagem nova pelo stream SSE — mesmo esquema do aviso de entrada,
 * mas persistente no canto da tela.
 */
export function NotificationBell() {
  const [leads, setLeads] = useState<LeadNovo[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [avisosNaoLidos, setAvisosNaoLidos] = useState(0);
  const [aberto, setAberto] = useState(false);
  const ultimaBuscaRef = useRef(0);

  const carregar = useCallback(async (forcar = false) => {
    if (!forcar && Date.now() - ultimaBuscaRef.current < INTERVALO_MINIMO_MS) return;
    if (!forcar && document.hidden) return;
    ultimaBuscaRef.current = Date.now();
    try {
      const [rl, ra] = await Promise.all([
        fetch("/api/captacao/leads-novos", { cache: "no-store" }),
        fetch("/api/notificacoes", { cache: "no-store" }),
      ]);
      if (rl.ok) setLeads(((await rl.json()) as { leads: LeadNovo[] }).leads ?? []);
      if (ra.ok) {
        const d = (await ra.json()) as { itens: Aviso[]; naoLidas: number };
        setAvisos(d.itens ?? []);
        setAvisosNaoLidos(d.naoLidas ?? 0);
      }
    } catch {
      /* sem rede: mantém o último contador conhecido */
    }
  }, []);

  useEffect(() => {
    // Primeira carga fora do corpo síncrono do efeito: a regra
    // react-hooks/set-state-in-effect barra setState alcançável daqui.
    const cargaInicial = setTimeout(() => void carregar(true), 0);

    const aoFocar = () => void carregar();
    const aoMudarVisibilidade = () => {
      if (!document.hidden) void carregar();
    };
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    // Mensagem recebida pode ser lead novo (ou resposta que tira lead da fila);
    // qualquer evento IN força a recontagem na hora.
    const cancelar = assinarMensagens((e) => {
      if (e.direcao === "IN") void carregar(true);
    });

    return () => {
      clearTimeout(cargaInicial);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      cancelar();
    };
  }, [carregar]);

  const total = leads.length + avisosNaoLidos;

  // Abriu o sino com aviso não lido: marca como lido no servidor antes de
  // recarregar — senão a releitura traria a contagem antiga de volta.
  async function abrirSino() {
    if (avisosNaoLidos > 0) {
      setAvisosNaoLidos(0);
      await fetch("/api/notificacoes", { method: "POST" }).catch(() => {});
    }
    await carregar(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAberto((v) => !v);
          if (aberto) void carregar(true);
          else void abrirSino();
        }}
        aria-label={total > 0 ? `Notificações (${total})` : "Notificações"}
        aria-expanded={aberto}
        className="fixed right-4 top-[calc(1rem_+_var(--safe-t))] z-30 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface/90 text-ink backdrop-blur transition-colors hover:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 1.8a4.2 4.2 0 0 0-4.2 4.2c0 2.1-.6 3.6-1.3 4.6-.3.5 0 1.1.6 1.1h9.8c.6 0 .9-.6.6-1.1-.7-1-1.3-2.5-1.3-4.6A4.2 4.2 0 0 0 8 1.8Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M6.5 13.7a1.6 1.6 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-bright px-1 text-[9px] font-bold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div onClick={() => setAberto(false)} aria-hidden className="fixed inset-0 z-30" />
          <div className="fixed right-4 top-[calc(4rem_+_var(--safe-t))] z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-4 py-3">
              <p className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
                {leads.length === 0
                  ? "Notificações"
                  : leads.length === 1
                    ? "1 lead novo"
                    : `${leads.length} leads novos`}
              </p>
              {leads.length > 0 && <p className="text-xs text-faint">Ninguém respondeu ainda.</p>}
            </div>

            {avisos.length > 0 && (
              <ul className="max-h-60 divide-y divide-border overflow-y-auto border-b border-border">
                {avisos.slice(0, 10).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.url ?? "/cobranca"}
                      onClick={() => setAberto(false)}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.lidaEm ? "bg-border" : "bg-red-bright"}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{a.titulo}</span>
                        <span className="block text-xs text-muted">{a.corpo}</span>
                        <span className="block text-[11px] text-faint">
                          {new Date(a.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {leads.length === 0 ? (
              avisos.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">Nada novo por aqui.</p>
              )
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{l.nome}</span>
                      <span className="block text-xs text-faint">
                        {formatarTelefone(l.telefone) || "sem número"}
                      </span>
                    </span>
                    {l.conversaId ? (
                      <Link
                        href={`/atendimento?c=${l.conversaId}`}
                        onClick={() => setAberto(false)}
                        className="shrink-0 rounded-md bg-red px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-bright"
                      >
                        Responder →
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-faint">sem conversa</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Push no celular: ativar/desativar o aviso deste aparelho. */}
            <div className="border-t border-border px-4 py-3">
              <AtivarNotificacoes />
            </div>

            <div className="border-t border-border px-4 py-3">
              <Link
                href="/captacao"
                onClick={() => setAberto(false)}
                className="text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                Ver a Captação →
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
