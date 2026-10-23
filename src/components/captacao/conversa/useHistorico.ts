"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import {
  codificarCursor,
  cursorDeNovidades,
  mesclarMensagens,
  primeiraConfirmada,
  type MensagemTela,
} from "@/lib/whatsapp/historico";
import type { MensagemItem } from "@/lib/types";

/** Rede de segurança: o SSE traz em tempo real; isto cobre um stream caído. */
const FALLBACK_THREAD_MS = 60_000;

/** A quantos pixels do fim ainda conta como "lendo o fim". */
const FOLGA_FIM_PX = 48;

/** Teto de voltas de uma recuperação de novidades (cada uma com até 200). */
const VOLTAS_NOVIDADES = 20;

export type RespostaPagina = { mensagens: MensagemItem[]; temAnteriores?: boolean; temMais?: boolean };

export function ehPagina(v: unknown): v is RespostaPagina {
  return typeof v === "object" && v !== null && Array.isArray((v as RespostaPagina).mensagens);
}

/**
 * O histórico de uma conversa na tela: abre pelo fim, carrega as anteriores sob
 * pedido, recebe as novidades (SSE + rede de segurança) e decide a rolagem.
 *
 * Quem lê o fim acompanha o que chega; quem está lendo acima fica onde está,
 * com o aviso de `novasAbaixo`.
 */
export function useHistorico(conversaId: string) {
  const [mensagens, setMensagens] = useState<MensagemTela[]>([]);
  const [temAnteriores, setTemAnteriores] = useState(false);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [erroAnteriores, setErroAnteriores] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erroAbertura, setErroAbertura] = useState("");
  const [novasAbaixo, setNovasAbaixo] = useState(0);

  const rolagem = useRef<HTMLDivElement>(null);
  const mensagensRef = useRef<MensagemTela[]>([]);
  useLayoutEffect(() => {
    mensagensRef.current = mensagens;
  }, [mensagens]);
  // Se a pessoa lia o fim antes da última atualização (a pintura nova já mudou a altura).
  const estaNoFimAntes = useRef(true);

  /* ---------- rolagem ---------- */

  // O que a próxima pintura da lista deve fazer com a rolagem.
  const pedidoRolagem = useRef<
    { tipo: "fim" } | { tipo: "ancora"; altura: number; topo: number } | null
  >({ tipo: "fim" });
  const ultimaVista = useRef<string | null>(null);

  function estaNoFim(): boolean {
    const el = rolagem.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= FOLGA_FIM_PX;
  }

  function irParaFim() {
    const el = rolagem.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNovasAbaixo(0);
  }

  useLayoutEffect(() => {
    const el = rolagem.current;
    const pedido = pedidoRolagem.current;
    pedidoRolagem.current = null;
    const reais = mensagens.filter((m) => !m.id.startsWith("tmp:"));
    const ultima = reais[reais.length - 1]?.id ?? null;
    const anterior = ultimaVista.current;
    ultimaVista.current = ultima;
    if (!el) return;
    if (pedido?.tipo === "fim") {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (pedido?.tipo === "ancora") {
      // Mensagens antigas entraram em cima: a que estava na tela continua lá.
      el.scrollTop = pedido.topo + (el.scrollHeight - pedido.altura);
      return;
    }
    if (ultima && ultima !== anterior && anterior !== null) {
      // Chegou coisa nova embaixo. Quem lê o fim acompanha; quem está lendo
      // acima fica onde está, com o aviso.
      const novas = reais.length - 1 - reais.findIndex((m) => m.id === anterior);
      if (estaNoFimAntes.current) el.scrollTop = el.scrollHeight;
      else setNovasAbaixo((n) => n + Math.max(1, novas));
    }
  }, [mensagens]);

  function aoRolar() {
    estaNoFimAntes.current = estaNoFim();
    if (estaNoFimAntes.current && novasAbaixo) setNovasAbaixo(0);
  }

  /**
   * Muda a lista vinda de fora (envio, aula agendada, limpeza). Com `fim`, a
   * próxima pintura desce até a última — é o que se espera depois de enviar.
   */
  function alterar(f: (atual: MensagemTela[]) => MensagemTela[], { fim = false } = {}) {
    if (fim) pedidoRolagem.current = { tipo: "fim" };
    setMensagens(f);
  }

  function esvaziar() {
    setMensagens([]);
    setTemAnteriores(false);
  }

  /* ---------- leitura ---------- */

  // Abre pelo fim da conversa. Trocar de conversa remonta o painel (`key`).
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/whatsapp/conversas/${conversaId}`, { cache: "no-store" });
        const d: unknown = await r.json().catch(() => null);
        if (!ativo) return;
        if (r.ok && ehPagina(d)) {
          pedidoRolagem.current = { tipo: "fim" };
          setMensagens((atual) => mesclarMensagens(atual, d.mensagens));
          setTemAnteriores(!!d.temAnteriores);
        } else {
          const e = (d as { erro?: string } | null)?.erro;
          setErroAbertura(r.status === 404 ? "Conversa não encontrada — pode ter sido removida." : (e ?? "Não foi possível abrir a conversa."));
        }
      } catch {
        if (ativo) setErroAbertura("Sem conexão para abrir a conversa.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [conversaId]);

  async function carregarAnteriores() {
    const primeira = primeiraConfirmada(mensagensRef.current);
    if (!primeira || carregandoAnteriores) return;
    setCarregandoAnteriores(true);
    setErroAnteriores("");
    try {
      const cursor = codificarCursor({ em: primeira.enviadaEm, id: primeira.id });
      const r = await fetch(
        `/api/whatsapp/conversas/${conversaId}/mensagens?antes=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const d: unknown = await r.json().catch(() => null);
      if (!r.ok || !ehPagina(d)) {
        setErroAnteriores("Não foi possível carregar as mensagens anteriores.");
        return;
      }
      const el = rolagem.current;
      if (el) pedidoRolagem.current = { tipo: "ancora", altura: el.scrollHeight, topo: el.scrollTop };
      setMensagens((atual) => mesclarMensagens(atual, d.mensagens));
      setTemAnteriores(!!d.temAnteriores);
    } catch {
      setErroAnteriores("Sem conexão para carregar as anteriores.");
    } finally {
      setCarregandoAnteriores(false);
    }
  }

  // Novidades: a partir da última confirmada (com uma janela de releitura para
  // pegar mensagem gravada atrasada), página após página até acabar. Uma de
  // cada vez — aviso que chega no meio marca para rodar de novo no fim.
  const buscandoNovidades = useRef(false);
  const rodarDeNovo = useRef(false);
  const buscarNovidades = useCallback(async () => {
    if (buscandoNovidades.current) {
      rodarDeNovo.current = true;
      return;
    }
    buscandoNovidades.current = true;
    try {
      do {
        rodarDeNovo.current = false;
        let cursor = cursorDeNovidades(mensagensRef.current);
        for (let volta = 0; volta < VOLTAS_NOVIDADES; volta++) {
          const url = cursor
            ? `/api/whatsapp/conversas/${conversaId}/mensagens?apos=${encodeURIComponent(cursor)}&limite=200`
            : `/api/whatsapp/conversas/${conversaId}/mensagens`;
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) break;
          const d: unknown = await r.json().catch(() => null);
          if (!ehPagina(d)) break;
          if (d.mensagens.length) {
            estaNoFimAntes.current = estaNoFim();
            setMensagens((atual) => mesclarMensagens(atual, d.mensagens));
          }
          const ultima = d.mensagens[d.mensagens.length - 1];
          if (!cursor || !d.temMais || !ultima) break;
          cursor = codificarCursor({ em: ultima.enviadaEm, id: ultima.id });
        }
      } while (rodarDeNovo.current);
    } catch {
      /* rede instável: o SSE reconecta e o fallback cobre */
    } finally {
      buscandoNovidades.current = false;
    }
  }, [conversaId]);

  useEffect(() => {
    const desassinar = assinarMensagens((e) => {
      if (!e.conversaId || e.conversaId === conversaId) void buscarNovidades();
    });
    const t = setInterval(() => void buscarNovidades(), FALLBACK_THREAD_MS);
    return () => {
      desassinar();
      clearInterval(t);
    };
  }, [conversaId, buscarNovidades]);

  return {
    mensagens,
    alterar,
    esvaziar,
    carregando,
    erroAbertura,
    temAnteriores,
    carregandoAnteriores,
    erroAnteriores,
    carregarAnteriores,
    buscarNovidades,
    rolagem,
    aoRolar,
    novasAbaixo,
    irParaFim,
  };
}
