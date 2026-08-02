"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { RespostaProntaItem } from "@/lib/types";

const campoCls =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/**
 * A lista mostra só a primeira frase — o suficiente para reconhecer a resposta
 * sem abrir um paredão de texto. O corpo inteiro vai no title (hover) e na
 * caixa de texto ao escolher.
 */
function primeiraFrase(texto: string) {
  const linha = texto.trim().split("\n")[0];
  const frase = linha.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? linha;
  return frase.length > 100 ? `${frase.slice(0, 100)}…` : frase;
}

/**
 * Gaveta de respostas prontas: acervo comum a todos os usuários. Qualquer
 * atendente cadastra (escreve ou cola) e todos escolhem da lista — a resposta
 * escolhida cai pronta na caixa de texto, para ajustar antes de enviar.
 *
 * A lista vem do servidor toda vez que a gaveta abre: o que a colega
 * cadastrou agora já aparece, sem precisar recarregar a página.
 */
export function RespostasProntas({
  aberto,
  onEscolher,
}: {
  /** Controlado pelo botão "Respostas prontas" na barra do topo da conversa. */
  aberto: boolean;
  /** Recebe o texto completo da resposta escolhida. */
  onEscolher: (texto: string) => void;
}) {
  const [respostas, setRespostas] = useState<RespostaProntaItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  // Formulário de cadastro: fechado por padrão — o uso comum é escolher, não criar.
  const [cadastrando, setCadastrando] = useState(false);
  const [novoTexto, setNovoTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Edição inline do título: troca a identificação na própria linha, sem
  // mexer na mensagem original.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tituloRascunho, setTituloRascunho] = useState("");
  const [renomeando, setRenomeando] = useState(false);
  const jaCarregou = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    (async () => {
      // Spinner só na primeira carga; nas seguintes a lista antiga fica na
      // tela enquanto a nova chega — sem piscar.
      if (!jaCarregou.current) setCarregando(true);
      try {
        const r = await fetch("/api/whatsapp/respostas", { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (r.ok) {
          setRespostas((d.respostas ?? []) as RespostaProntaItem[]);
          setErro("");
          jaCarregou.current = true;
        } else {
          setErro(d?.erro ?? "Não foi possível carregar as respostas.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [aberto]);

  async function salvar() {
    const texto = novoTexto.trim();
    if (!texto || salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/whatsapp/respostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setRespostas((antigas) => [d.resposta as RespostaProntaItem, ...antigas]);
        setNovoTexto("");
        setCadastrando(false);
      } else {
        setErro(d?.erro ?? "Não foi possível salvar a resposta.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  /** Salva só o título; vazio limpa e a linha volta à primeira frase. */
  async function salvarTitulo(id: string) {
    if (renomeando) return;
    setRenomeando(true);
    setErro("");
    try {
      const r = await fetch(`/api/whatsapp/respostas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: tituloRascunho }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setRespostas((antigas) =>
          antigas.map((x) => (x.id === id ? (d.resposta as RespostaProntaItem) : x)),
        );
        setEditandoId(null);
      } else {
        setErro(d?.erro ?? "Não foi possível salvar o título.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setRenomeando(false);
    }
  }

  async function remover(id: string) {
    // Otimista: some da lista na hora; se o servidor recusar, volta no refetch
    // da próxima abertura. Acervo de trabalho, não trilha de auditoria.
    setRespostas((antigas) => antigas.filter((r) => r.id !== id));
    try {
      await fetch(`/api/whatsapp/respostas/${id}`, { method: "DELETE" });
    } catch {
      /* rede instável: a próxima abertura ressincroniza */
    }
  }

  return (
    // Mesmo padrão da gaveta de classificação: borda só aberta, colapso por 0fr.
    <div className={cn("bg-surface-2/40 text-xs", aberto && "border-t border-border")}>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted">
                Respostas prontas
                <span className="ml-1.5 font-normal text-faint">— comuns a todos os usuários</span>
              </p>
              <button
                onClick={() => setCadastrando((a) => !a)}
                className="text-[11px] font-semibold uppercase tracking-wide text-red-bright transition-colors hover:underline"
              >
                {cadastrando ? "Cancelar" : "+ Cadastrar"}
              </button>
            </div>

            {cadastrando && (
              <div className="mt-2">
                <textarea
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="Escreva ou cole a resposta… Ela fica guardada para todo mundo usar."
                  className={cn(campoCls, "resize-y")}
                />
                <button
                  onClick={() => void salvar()}
                  disabled={salvando || !novoTexto.trim()}
                  className={cn(
                    "mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
                    salvando || !novoTexto.trim()
                      ? "cursor-not-allowed border-border text-faint"
                      : "border-border-strong text-muted hover:text-ink",
                  )}
                >
                  {salvando ? "Salvando…" : "Salvar resposta"}
                </button>
              </div>
            )}

            {erro && <p className="mt-2 text-xs text-red-bright">{erro}</p>}

            <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
              {carregando && (
                <li className="px-3 py-4 text-center text-faint">Carregando respostas…</li>
              )}
              {!carregando && respostas.length === 0 && (
                <li className="px-3 py-4 text-center text-faint">
                  Nenhuma resposta cadastrada ainda. Cadastre a primeira — ela vale para todo mundo.
                </li>
              )}
              {respostas.map((r) =>
                editandoId === r.id ? (
                  // Modo edição: o input toma a linha; Enter salva, Esc cancela.
                  // Título vazio limpa e a linha volta à primeira frase do texto.
                  <li key={r.id} className="flex items-center gap-1 px-2 py-1.5">
                    <input
                      value={tituloRascunho}
                      onChange={(e) => setTituloRascunho(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void salvarTitulo(r.id);
                        }
                        if (e.key === "Escape") setEditandoId(null);
                      }}
                      autoFocus
                      maxLength={80}
                      placeholder="Título da resposta… (vazio volta à primeira frase)"
                      className={campoCls}
                    />
                    <button
                      onClick={() => void salvarTitulo(r.id)}
                      disabled={renomeando}
                      title="Salvar título"
                      aria-label="Salvar título"
                      className="shrink-0 rounded-md p-1.5 text-ok transition-colors hover:bg-surface-2"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                        <path d="M2.5 7l3 3 5-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      title="Cancelar"
                      aria-label="Cancelar edição do título"
                      className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ) : (
                  <li key={r.id} className="flex items-center gap-1">
                    <button
                      onClick={() => onEscolher(r.texto)}
                      title={r.texto}
                      className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-red-ghost"
                    >
                      <span className="block truncate text-xs font-medium text-ink">
                        {r.titulo ?? primeiraFrase(r.texto)}
                      </span>
                      {r.autor && <span className="block text-[10px] text-faint">por {r.autor}</span>}
                    </button>
                    <button
                      onClick={() => {
                        setEditandoId(r.id);
                        setTituloRascunho(r.titulo ?? "");
                        setErro("");
                      }}
                      title="Renomear (a mensagem não muda)"
                      aria-label="Renomear resposta"
                      className="shrink-0 px-1.5 py-2 text-faint transition-colors hover:text-ink"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M8.2 1.9a1.1 1.1 0 0 1 1.6 0l.3.3a1.1 1.1 0 0 1 0 1.6L4.7 9.2 2 10l.8-2.7z"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => void remover(r.id)}
                      title="Remover do acervo"
                      aria-label="Remover resposta"
                      className="shrink-0 px-1.5 py-2 text-faint transition-colors hover:text-red-bright"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
