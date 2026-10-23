"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import { mesclarConversas, ordenarConversas } from "@/lib/whatsapp/historico";
import type { ConversaResumo } from "@/lib/types";

/** Rede de segurança: o SSE atualiza em tempo real; isto cobre um stream caído. */
const FALLBACK_LISTA_MS = 60_000;

/** Rótulo do grupo enquanto o assunto não chega da Evolution — ver `toResumo`. */
const GRUPO_SEM_NOME = "Grupo do WhatsApp";

function ehListaConversas(v: unknown): v is { conversas: ConversaResumo[]; proximo?: string | null } {
  return typeof v === "object" && v !== null && Array.isArray((v as { conversas?: unknown }).conversas);
}

/**
 * A lista de conversas carregada: primeira página do servidor, "Carregar mais"
 * para as seguintes e atualização em tempo real (SSE + rede de segurança).
 *
 * Enquanto o ponteiro ou o foco estão na lista (`entrar`/`sair`), ninguém muda
 * de lugar: a conversa que sobe por mensagem nova faria o clique cair na de baixo.
 */
export function useListaConversas(inicial: ConversaResumo[], proximoInicial: string | null) {
  const [conversas, setConversas] = useState(inicial);
  const [proximo, setProximo] = useState(proximoInicial);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState("");

  const interagindo = useRef(false);
  const reordenarAoSair = useRef(false);

  const buscarLista = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/conversas", { cache: "no-store" });
      if (!r.ok) return;
      const d: unknown = await r.json();
      if (!ehListaConversas(d)) return;
      const manterOrdem = interagindo.current;
      if (manterOrdem) reordenarAoSair.current = true;
      setConversas((atual) => mesclarConversas(atual, d.conversas, { manterOrdem }));
    } catch {
      /* rede instável: o SSE reconecta e o fallback cobre */
    }
  }, []);

  function entrar() {
    interagindo.current = true;
  }
  function sair() {
    interagindo.current = false;
    if (reordenarAoSair.current) {
      reordenarAoSair.current = false;
      setConversas((a) => ordenarConversas(a));
    }
  }

  async function carregarMais() {
    if (!proximo || carregandoMais) return;
    setCarregandoMais(true);
    setErroMais("");
    try {
      const r = await fetch(`/api/whatsapp/conversas?antes=${encodeURIComponent(proximo)}`, {
        cache: "no-store",
      });
      const d: unknown = await r.json().catch(() => null);
      if (!r.ok || !ehListaConversas(d)) {
        setErroMais("Não foi possível carregar mais conversas.");
        return;
      }
      // Página seguinte vai para o fim: não mexe em nada que já está na tela.
      setConversas((a) => mesclarConversas(a, d.conversas, { manterOrdem: true }));
      setProximo(d.proximo ?? null);
    } catch {
      setErroMais("Sem conexão para carregar mais conversas.");
    } finally {
      setCarregandoMais(false);
    }
  }

  // Tempo real: qualquer mensagem nova atualiza a lista na hora; polling lento
  // fica de rede de segurança se o stream cair.
  useEffect(() => {
    const desassinar = assinarMensagens(() => void buscarLista());
    const t = setInterval(() => void buscarLista(), FALLBACK_LISTA_MS);
    return () => {
      desassinar();
      clearInterval(t);
    };
  }, [buscarLista]);

  // Grupo entra pelo webhook sem o assunto. Ao ver grupo sem nome, pede o
  // título à Evolution uma vez; o servidor tem janela própria.
  const faltaNome = conversas.some((c) => c.ehGrupo && c.nome === GRUPO_SEM_NOME);
  useEffect(() => {
    if (!faltaNome) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/whatsapp/grupos", { method: "POST" });
        const d = (await r.json().catch(() => ({}))) as { renomeados?: number };
        if (ativo && d.renomeados) await buscarLista();
      } catch {
        /* sem nome do grupo a inbox continua funcionando */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [faltaNome, buscarLista]);

  return { conversas, setConversas, proximo, carregandoMais, erroMais, carregarMais, entrar, sair };
}
