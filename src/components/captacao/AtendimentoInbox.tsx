"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import { ConversaPainel } from "@/components/captacao/ConversaPainel";
import { cn } from "@/lib/cn";
import { casaConversa, trechoAoRedor } from "@/lib/whatsapp/busca";
import { ehDataISO, mensagemRemarcarAula } from "@/lib/aula-experimental";
import {
  INTERESSE_LABEL,
  type ConversaBuscaItem,
  type ConversaInteresse,
  type ConversaResumo,
} from "@/lib/types";

/** Rede de segurança: o SSE atualiza em tempo real; isto cobre um stream caído. */
const FALLBACK_LISTA_MS = 60_000;

/** Rótulo do grupo enquanto o assunto não chega da Evolution — ver `toResumo`. */
const GRUPO_SEM_NOME = "Grupo do WhatsApp";

type Aba = "pessoas" | "grupos";

/** Linha da lista: a conversa, mais o trecho quando ela veio da busca. */
type LinhaConversa = ConversaResumo & { trecho?: string };

/** Ponto na cor da bandeira do estágio — a mesma língua da Captação. */
const PONTO: Record<ConversaInteresse, string> = {
  nao_classificado: "bg-white",
  com_interesse: "bg-warn",
  sem_interesse: "bg-info",
  perdido: "bg-red-bright",
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
 * Inbox do WhatsApp: lista à esquerda, conversa à direita no desktop. No mobile
 * é uma tela por vez, como o app do celular: primeiro a lista; tocar numa
 * conversa abre só ela, com botão de voltar.
 * Atualiza por polling — uma recepção não justifica SSE nem WebSocket.
 */
export function AtendimentoInbox({
  inicial,
  assinatura,
  enterEnvia,
  conectado,
  podeResponder,
  podeApagar,
  cabecalho,
}: {
  inicial: ConversaResumo[];
  /** Login de quem está atendendo — assina as respostas na conversa. */
  assinatura: string;
  /** Preferência da conta: Enter envia a resposta ou quebra linha. */
  enterEnvia: boolean;
  conectado: boolean;
  podeResponder: boolean;
  podeApagar: boolean;
  /** Abas + status da conexão; no mobile some junto com a lista ao abrir uma conversa. */
  cabecalho?: ReactNode;
}) {
  // `?c=<id>` vem do link "Responder" da tabela de leads e do aviso de login.
  const params = useSearchParams();
  const alvo = params.get("c");
  // `?remarcar=<data da aula>` vem do "Não compareceu" da Captação: abre a
  // conversa com o convite já escrito na caixa, para a recepção ler e enviar.
  // A data viaja na URL (e não o texto inteiro) para a mensagem continuar
  // morando num lugar só, e sair sempre com o dia certo.
  const remarcar = params.get("remarcar");
  const textoInicial =
    remarcar && ehDataISO(remarcar) ? mensagemRemarcarAula(remarcar) : undefined;
  const [conversas, setConversas] = useState(inicial);
  const inicialSelecionada = alvo && inicial.some((c) => c.id === alvo) ? alvo : null;
  const [aba, setAba] = useState<Aba>(
    inicial.find((c) => c.id === inicialSelecionada)?.ehGrupo ? "grupos" : "pessoas",
  );
  const [selecionada, setSelecionada] = useState<string | null>(
    inicialSelecionada ?? inicial.find((c) => !c.ehGrupo)?.id ?? inicial[0]?.id ?? null,
  );
  // No mobile decide qual tela aparece: a lista (false) ou a conversa (true).
  // Quem chega pelo link "Responder" já cai direto na conversa.
  const [aberta, setAberta] = useState(inicialSelecionada !== null);
  // Se abrimos uma entrada no histórico, o "voltar" precisa desfazê-la; sem a
  // flag, um voltar em conversa aberta por deep link sairia da página.
  const empurrouHistorico = useRef(false);
  // Busca: o campo filtra a lista na hora (nome, telefone, última mensagem) e,
  // em paralelo, o servidor procura a palavra no histórico inteiro.
  const [busca, setBusca] = useState("");
  // O resultado carrega o termo que o gerou: assim o de uma busca anterior
  // nunca é usado como se fosse o da palavra que está no campo agora.
  const [achados, setAchados] = useState<{ termo: string; itens: ConversaBuscaItem[] }>({
    termo: "",
    itens: [],
  });

  const buscarLista = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/conversas", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { conversas: ConversaResumo[] };
      setConversas(d.conversas ?? []);
    } catch {
      /* rede instável: o SSE reconecta e o fallback cobre */
    }
  }, []);

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

  // O botão voltar do celular fecha a conversa em vez de sair da página —
  // `abrir` empurra uma entrada no histórico e o popstate desfaz a tela cheia.
  useEffect(() => {
    const aoVoltar = () => {
      empurrouHistorico.current = false;
      setAberta(false);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  // Busca no histórico: espera a digitação parar para não disparar uma consulta
  // por tecla. O filtro local já respondeu enquanto isso.
  const termo = busca.trim();
  useEffect(() => {
    if (termo.length < 2) return;
    let ativo = true;
    const t = setTimeout(async () => {
      let itens: ConversaBuscaItem[] = [];
      try {
        const r = await fetch(`/api/whatsapp/conversas/busca?q=${encodeURIComponent(termo)}`, {
          cache: "no-store",
        });
        const d = (await r.json().catch(() => ({}))) as { conversas?: ConversaBuscaItem[] };
        if (r.ok) itens = d.conversas ?? [];
      } catch {
        /* sem rede a busca fica só no que já está na tela */
      }
      // Marca o termo mesmo sem resultado: é o que tira o "procurando…".
      if (ativo) setAchados({ termo, itens });
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [termo]);

  // Enquanto o resultado não chega para o termo atual, a tela avisa em vez de
  // dizer que não achou nada.
  const buscandoServidor = termo.length >= 2 && achados.termo !== termo;

  /**
   * A lista que a tela mostra. Sem busca, é a inbox inteira. Com busca, junta o
   * que casou aqui com o que o servidor achou no histórico — a conversa achada
   * pode nem estar na lista carregada, se for antiga o bastante.
   */
  const filtradas = useMemo<LinhaConversa[]>(() => {
    if (!termo) return conversas;
    const porId = new Map<string, LinhaConversa>();
    for (const c of conversas) if (casaConversa(c, termo)) porId.set(c.id, c);
    // Resultado de um termo anterior não vale para a palavra que está no campo.
    for (const a of achados.termo === termo ? achados.itens : []) {
      // A versão da lista está mais fresca (não lidas, última mensagem); do
      // achado interessa o trecho que casou.
      porId.set(a.id, { ...(porId.get(a.id) ?? a), trecho: a.trecho });
    }
    return [...porId.values()].sort((x, y) =>
      y.ultimaMensagemEm.localeCompare(x.ultimaMensagemEm),
    );
  }, [conversas, achados, termo]);

  const pessoas = filtradas.filter((c) => !c.ehGrupo);
  const grupos = filtradas.filter((c) => c.ehGrupo);
  const visiveis = aba === "grupos" ? grupos : pessoas;

  function trocarAba(nova: Aba) {
    setAba(nova);
    const lista = nova === "grupos" ? grupos : pessoas;
    // Sem isso a conversa aberta continuaria à direita fora da aba escolhida.
    if (!lista.some((c) => c.id === selecionada)) setSelecionada(lista[0]?.id ?? null);
  }

  // A conversa aberta some da lista só se for apagada; mantém a seleção viva —
  // inclusive filtrando, e inclusive quando ela só existe no resultado da busca.
  const atual =
    conversas.find((c) => c.id === selecionada) ??
    achados.itens.find((c) => c.id === selecionada) ??
    null;

  function atualizarConversa(c: ConversaResumo) {
    setConversas((antigas) => antigas.map((a) => (a.id === c.id ? { ...a, ...c } : a)));
  }

  function removerConversa(id: string) {
    const restantes = conversas.filter((a) => a.id !== id);
    setConversas(restantes);
    setSelecionada((atual) => (atual === id ? (restantes[0]?.id ?? null) : atual));
    voltar(); // no mobile a conversa apagada não deve continuar em tela cheia
  }

  function abrir(id: string) {
    setSelecionada(id);
    // abrir zera o badge; o servidor faz o mesmo no GET
    setConversas((a) => a.map((x) => (x.id === id ? { ...x, naoLidas: 0 } : x)));
    setAberta(true);
    // A entrada extra no histórico só faz sentido no mobile, onde abrir troca de
    // tela; no desktop viraria um botão voltar que "não navega".
    const mobile = !window.matchMedia("(min-width: 1024px)").matches;
    if (mobile && !empurrouHistorico.current) {
      window.history.pushState({ conversaAberta: true }, "");
      empurrouHistorico.current = true;
    }
  }

  function voltar() {
    // Com entrada empurrada, volta pelo histórico (o popstate fecha a tela);
    // sem ela, só fecha — history.back() aqui sairia da página.
    if (empurrouHistorico.current) window.history.back();
    else setAberta(false);
  }

  if (conversas.length === 0) {
    return (
      <>
        {cabecalho}
        <Card className="px-5 py-16 text-center">
          <p className="text-sm text-faint">
            {conectado
              ? "Nenhuma conversa ainda. Quando alguém chamar no WhatsApp, o lead e o histórico aparecem aqui sozinhos."
              : "Conecte o WhatsApp para começar a receber conversas."}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      {/* Conversa aberta no mobile toma a tela toda: até o cabeçalho da página sai. */}
      {cabecalho && <div className={cn(aberta && "hidden lg:block")}>{cabecalho}</div>}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card
          className={cn(
            // 100dvh conta a área embaixo da barra de status e da de gestos;
            // sem descontar os recuos, a lista passaria da tela no app instalado.
            "h-[calc(100dvh_-_8rem_-_var(--safe-t)_-_var(--safe-b))] flex-col overflow-hidden",
            aberta ? "hidden lg:flex" : "flex",
          )}
        >
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

          {/* Busca: nome, telefone ou palavra que ficou no meio da conversa. */}
          <div className="relative shrink-0 border-b border-border px-3 py-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              type="search"
              placeholder="Buscar nome, telefone ou palavra…"
              aria-label="Buscar conversa por nome, telefone ou palavra"
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 pr-8 text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-red/60"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute right-5 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:text-ink"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <ul className="flex-1 overflow-y-auto">
            {visiveis.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-faint">
                {termo
                  ? buscandoServidor
                    ? "Procurando no histórico…"
                    : `Nada encontrado para “${termo}”. A busca cobre nome, telefone e o que foi escrito nas conversas.`
                  : aba === "grupos"
                    ? "Nenhum grupo por aqui ainda. O grupo entra nesta aba na primeira mensagem nova que chegar nele — conversa anterior não é importada."
                    : "Nenhuma conversa individual ainda."}
              </li>
            )}
            {visiveis.map((c) => {
              const ativo = c.id === selecionada;
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrir(c.id);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0",
                      ativo ? "bg-red-ghost" : "hover:bg-surface-2",
                    )}
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PONTO[c.interesse])} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          {c.personId && (
                            // "ver" abre o cadastro do contato sem trocar a conversa aberta.
                            <Link
                              href={`/matriculados/${c.personId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-red-bright hover:underline"
                            >
                              ver
                            </Link>
                          )}
                          <span className="truncate text-[13px] font-medium text-ink">{c.nome}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-faint">{quando(c.ultimaMensagemEm)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        {/* Achado no histórico mostra o pedaço que casou, não a
                            última mensagem — é o que responde "por que essa
                            conversa apareceu?". */}
                        <span className="truncate text-[11px] text-muted">
                          {c.trecho
                            ? trechoAoRedor(c.trecho, termo)
                            : c.preview || c.telefone}
                        </span>
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
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* No mobile este cartão só existe com uma conversa aberta; sem o
            cabeçalho da página, ganha um pouco mais de altura que no desktop. */}
        <Card
          className={cn(
            "h-[calc(100dvh_-_7rem_-_var(--safe-t)_-_var(--safe-b))] overflow-hidden lg:h-[calc(100dvh_-_8rem_-_var(--safe-t)_-_var(--safe-b))]",
            aberta ? "block" : "hidden lg:block",
          )}
        >
          {atual ? (
            <div className="flex h-full flex-col">
              {/* Topo estilo WhatsApp, só no mobile: voltar + nome. No desktop o
                  nome já aparece marcado na lista ao lado. */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2 lg:hidden">
                <button
                  onClick={voltar}
                  aria-label="Voltar para as conversas"
                  className="-ml-1 rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[atual.interesse])} />
                {/* Nome com a classificação embaixo: tocar numa bandeira dá o
                    retorno na hora, sem precisar voltar para a lista. */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{atual.nome}</span>
                  {!atual.ehGrupo && (
                    <span className="block truncate text-[11px] uppercase tracking-wide text-faint">
                      {INTERESSE_LABEL[atual.interesse]}
                    </span>
                  )}
                </span>
                {atual.personId && (
                  <Link
                    href={`/matriculados/${atual.personId}`}
                    className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-red-bright hover:underline"
                  >
                    ver
                  </Link>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <ConversaPainel
                  key={atual.id}
                  conversa={atual}
                  // Só a conversa que veio no link recebe o texto pronto —
                  // trocar de conversa depois não arrasta o convite junto.
                  textoInicial={atual.id === alvo ? textoInicial : undefined}
                  assinatura={assinatura}
                  enterEnvia={enterEnvia}
                  podeResponder={podeResponder}
                  podeApagar={podeApagar}
                  onConversaAtualizada={atualizarConversa}
                  onConversaRemovida={removerConversa}
                />
              </div>
            </div>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-faint">
              Escolha uma conversa à esquerda.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
