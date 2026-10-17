"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Modal que sobrepõe a página inteira.
 *
 * O portal para `document.body` não é detalhe de estilo, é o que faz funcionar:
 * qualquer ancestral com `transform` vira containing block e faz `position:
 * fixed` se comportar como `absolute`, prendendo o modal dentro do container.
 * O `Reveal` (GSAP `from` com `y`) deixa um transform inline em toda seção das
 * páginas, então todo modal renderizado dentro dele ficava preso e cortado.
 *
 * Centraliza com `m-auto` em vez de `items-center`: com conteúdo mais alto que a
 * viewport, `items-center` empurra o topo para fora da tela e ele fica
 * inalcançável — não dá nem para rolar até ele. Com margem automática o
 * excedente vira scroll normal do backdrop.
 *
 * Clique no fundo NÃO fecha por padrão: são quase todos formulários, e o clique
 * perdido ao lado do campo apagava tudo que já tinha sido digitado. Fecha por
 * Esc (se o consumidor permitir) ou pelos botões do próprio diálogo. Avisos sem
 * dado digitado podem optar por `fecharAoClicarFora`.
 *
 * Acessibilidade:
 * - Nome: `<TituloModal>` dentro do diálogo (vira `aria-labelledby`) ou `rotulo`.
 * - Foco: vai para o elemento com `autoFocus`/`data-autofocus`; sem ele, para o
 *   próprio diálogo (não para o primeiro botão — em confirmação, Enter não
 *   pode disparar a ação por acidente). Tab/Shift+Tab ficam contidos e, ao
 *   fechar, o foco volta para quem abriu.
 * - Fundo: tudo fora do diálogo do topo fica `inert` e a rolagem do body trava.
 * - Diálogos empilhados: só o de cima responde ao Esc e ao Tab.
 */

const ContextoModal = createContext<{ tituloId: string; descricaoId: string } | null>(null);

/* ---------- pilha de diálogos abertos (fora do React: é estado do documento) ---------- */

const pilha: HTMLElement[] = [];
const inertesPorNos = new Set<Element>();
let travasDeRolagem = 0;
let overflowAnterior = "";

function sincronizarFundo() {
  const topo = pilha[pilha.length - 1];
  for (const el of Array.from(document.body.children)) {
    const deveFicarInerte = topo !== undefined && el !== topo;
    if (deveFicarInerte && !el.hasAttribute("inert")) {
      el.setAttribute("inert", "");
      inertesPorNos.add(el);
    } else if (!deveFicarInerte && inertesPorNos.has(el)) {
      el.removeAttribute("inert");
      inertesPorNos.delete(el);
    }
  }
  // elementos marcados que saíram do body (portal desmontado)
  for (const el of Array.from(inertesPorNos)) {
    if (!el.isConnected) inertesPorNos.delete(el);
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
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );
}

export function Modal({
  children,
  onFechar,
  fecharComEsc = true,
  fecharAoClicarFora = false,
  rotulo,
  className,
}: {
  children: ReactNode;
  /** Chamado pelo Esc. Omitido = o diálogo não é dispensável pelo teclado. */
  onFechar?: () => void;
  /**
   * Política do Esc por consumidor. Passe `false` enquanto uma operação estiver
   * em andamento ou quando o diálogo só pode sair pelos próprios botões.
   */
  fecharComEsc?: boolean;
  /** Clique no véu fecha (só para avisos — nunca em formulário). */
  fecharAoClicarFora?: boolean;
  /** Nome acessível quando o diálogo não tem `<TituloModal>` visível. */
  rotulo?: string;
  /** Ajustes do diálogo (largura, alinhamento do texto). */
  className?: string;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const descricaoId = useId();

  // As props mudam a cada render (arrow inline); o efeito de montagem lê o valor
  // atual por ref para não refazer foco/inert/scroll a cada digitação.
  const fecharRef = useRef<(() => void) | undefined>(undefined);
  const escRef = useRef(fecharComEsc);
  // o clique só conta se começou no véu (arrastar uma seleção para fora não fecha)
  const pressionouNoFundo = useRef(false);
  useEffect(() => {
    fecharRef.current = onFechar;
    escRef.current = fecharComEsc;
  });

  useEffect(() => {
    const raiz = raizRef.current;
    const dialogo = dialogoRef.current;
    if (!raiz || !dialogo) return;

    const acionador = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    pilha.push(raiz);
    sincronizarFundo();
    travarRolagem();

    if (!dialogo.contains(document.activeElement)) {
      const preferido = dialogo.querySelector<HTMLElement>("[data-autofocus]");
      (preferido ?? dialogo).focus({ preventScroll: true });
    }

    if (process.env.NODE_ENV !== "production" && !rotulo && !document.getElementById(tituloId)) {
      console.warn("Modal sem nome acessível: use <TituloModal> ou a prop `rotulo`.");
    }

    const aoTeclar = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== raiz) return;

      if (e.key === "Escape") {
        if (escRef.current && fecharRef.current) {
          e.preventDefault();
          fecharRef.current();
        }
        return;
      }

      if (e.key !== "Tab") return;
      const lista = focaveis(dialogo);
      if (lista.length === 0) {
        e.preventDefault();
        dialogo.focus();
        return;
      }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === dialogo || !dialogo.contains(atual))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (atual === ultimo || !dialogo.contains(atual))) {
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
      // devolve o foco a quem abriu, se ele ainda existe e está disponível
      if (acionador?.isConnected && !acionador.closest("[inert]")) {
        acionador.focus({ preventScroll: true });
      }
    };
    // montagem/desmontagem apenas — os valores vivos chegam pelos refs acima
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    // Diálogo alto no celular encosta nas bordas: os recuos mantêm o topo
    // longe do relógio e o rodapé longe da barra de gestos.
    <div
      ref={raizRef}
      onMouseDown={(e) => {
        pressionouNoFundo.current = e.target === e.currentTarget;
        // o véu não recebe foco: sem isto o clique fora joga o foco no body
        if (pressionouNoFundo.current) e.preventDefault();
      }}
      onClick={(e) => {
        if (fecharAoClicarFora && pressionouNoFundo.current && e.target === e.currentTarget) {
          onFechar?.();
        }
      }}
      className="fixed inset-0 z-[60] flex overflow-y-auto overscroll-contain bg-scrim px-4 pt-[calc(1rem_+_var(--safe-t))] pb-[calc(1rem_+_var(--safe-b))]"
    >
      <ContextoModal.Provider value={{ tituloId, descricaoId }}>
        <div
          ref={dialogoRef}
          role="dialog"
          aria-modal="true"
          aria-label={rotulo}
          aria-labelledby={rotulo ? undefined : tituloId}
          aria-describedby={descricaoId}
          tabIndex={-1}
          className={cn(
            "m-auto w-full max-w-md rounded-xl border border-border bg-surface p-5 sm:p-6",
            "shadow-[var(--shadow-overlay)] outline-none",
            "motion-safe:animate-[dialogo-entra_160ms_var(--ease-padrao)]",
            className,
          )}
        >
          {children}
        </div>
      </ContextoModal.Provider>
    </div>,
    document.body,
  );
}

/** Título do diálogo — também é o nome acessível dele. */
export function TituloModal({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(ContextoModal);
  return (
    <h2 id={ctx?.tituloId} className={cn("text-lg font-semibold text-ink", className)}>
      {children}
    </h2>
  );
}

/** Texto de apoio logo abaixo do título (vira `aria-describedby`). */
export function DescricaoModal({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(ContextoModal);
  return (
    <p id={ctx?.descricaoId} className={cn("mt-1 text-sm text-muted", className)}>
      {children}
    </p>
  );
}
