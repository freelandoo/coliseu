"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Camadas modais do app (diálogos e a gaveta do menu) — um sistema só.
 *
 * Enquanto uma camada está ativa:
 * - tudo fora dela fica `inert` (irmãos de cada ancestral até o body — serve
 *   tanto ao diálogo em portal quanto à gaveta que mora dentro do layout);
 * - a rolagem do body trava (contador: camadas empilhadas não se atrapalham);
 * - só a camada do topo responde a Esc e prende o Tab;
 * - ao sair, o foco volta para quem abriu, se ele ainda estiver visível.
 */

const pilha: HTMLElement[] = [];
const inertesPorNos = new Set<Element>();
let travasDeRolagem = 0;
let overflowAnterior = "";

/** Tudo que precisa ficar inerte para isolar `alvo`: os irmãos de cada ancestral. */
function foraDe(alvo: HTMLElement): Set<Element> {
  const fora = new Set<Element>();
  let no: HTMLElement | null = alvo;
  while (no && no !== document.body && no.parentElement) {
    for (const irmao of Array.from(no.parentElement.children)) {
      if (irmao !== no && irmao.tagName !== "SCRIPT") fora.add(irmao);
    }
    no = no.parentElement;
  }
  return fora;
}

function sincronizarFundo() {
  const topo = pilha[pilha.length - 1];
  const deveFicar = topo ? foraDe(topo) : new Set<Element>();
  for (const el of Array.from(inertesPorNos)) {
    if (!deveFicar.has(el) || !el.isConnected) {
      el.removeAttribute("inert");
      inertesPorNos.delete(el);
    }
  }
  for (const el of deveFicar) {
    if (!el.hasAttribute("inert")) {
      el.setAttribute("inert", "");
      inertesPorNos.add(el);
    }
  }
}

function travarRolagem() {
  if (travasDeRolagem++ === 0) {
    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function liberarRolagem() {
  if (--travasDeRolagem === 0) document.body.style.overflow = overflowAnterior;
}

const FOCAVEIS =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), iframe, audio[controls], video[controls], ' +
  '[contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
  );
}

export function useCamada({
  ativa,
  raizRef,
  focoRef,
  onEsc,
}: {
  ativa: boolean;
  /** Elemento que contém tudo que continua interativo (véu incluso). */
  raizRef: RefObject<HTMLElement | null>;
  /** Onde o Tab dá a volta e o foco inicial cai se nada pedir `data-autofocus`. */
  focoRef: RefObject<HTMLElement | null>;
  /** Esc na camada do topo. `undefined` = Esc não fecha. */
  onEsc?: () => void;
}) {
  // valor vivo do callback sem refazer foco/inert a cada render
  const escRef = useRef(onEsc);
  useEffect(() => {
    escRef.current = onEsc;
  });

  useEffect(() => {
    if (!ativa) return;
    const raiz = raizRef.current;
    const alvo = focoRef.current;
    if (!raiz || !alvo) return;

    const acionador = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    pilha.push(raiz);
    sincronizarFundo();
    travarRolagem();

    if (!alvo.contains(document.activeElement)) {
      const preferido = alvo.querySelector<HTMLElement>("[data-autofocus]");
      (preferido ?? alvo).focus({ preventScroll: true });
    }

    const aoTeclar = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== raiz) return;

      if (e.key === "Escape") {
        if (escRef.current) {
          e.preventDefault();
          escRef.current();
        }
        return;
      }

      if (e.key !== "Tab") return;
      const lista = focaveis(alvo);
      if (lista.length === 0) {
        e.preventDefault();
        alvo.focus();
        return;
      }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === alvo || !alvo.contains(atual))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (atual === ultimo || !alvo.contains(atual))) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      const i = pilha.lastIndexOf(raiz);
      if (i !== -1) pilha.splice(i, 1);
      sincronizarFundo();
      liberarRolagem();
      // devolve o foco a quem abriu — se ainda existe, está disponível e
      // visível (o botão do menu some ao virar desktop)
      if (
        acionador?.isConnected &&
        !acionador.closest("[inert]") &&
        acionador.getClientRects().length > 0
      ) {
        acionador.focus({ preventScroll: true });
      }
    };
  }, [ativa, raizRef, focoRef]);
}
