"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import { ConversaPainel } from "@/components/captacao/ConversaPainel";
import { ContextoPessoa } from "@/components/captacao/ContextoPessoa";
import { ChaveQuebraLinha } from "@/components/captacao/ChaveQuebraLinha";
import { cn } from "@/lib/cn";
import {
  ORDEM_BANDEIRAS,
  casaConversa,
  contarBandeiras,
  filtrarPorBandeira,
  trechoAoRedor,
} from "@/lib/whatsapp/busca";
import { mesclarConversas, ordenarConversas } from "@/lib/whatsapp/historico";
import { temRascunho, usarConta } from "@/lib/whatsapp/rascunhos";
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

/** Painel da ficha ao lado da conversa só cabe com folga a partir daqui. */
const LARGURA_PAINEL_LATERAL = "(min-width: 1280px)";

type Aba = "pessoas" | "grupos";

/** Linha da lista: a conversa, mais o trecho quando ela veio da busca. */
type LinhaConversa = ConversaResumo & { trecho?: string };

/** Resultado da busca no servidor, sempre preso ao termo que o originou. */
type Achados =
  | { termo: string; estado: "ok"; itens: ConversaBuscaItem[] }
  | { termo: string; estado: "erro"; itens: [] };

/** Ponto na cor da bandeira do estágio — a mesma língua da Captação. */
const PONTO: Record<ConversaInteresse, string> = {
  nao_classificado: "bg-surface ring-1 ring-control",
  com_interesse: "bg-warning",
  sem_interesse: "bg-info",
  perdido: "bg-danger",
  convertido: "bg-success",
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

function ehListaConversas(v: unknown): v is { conversas: ConversaResumo[]; proximo?: string | null } {
  return typeof v === "object" && v !== null && Array.isArray((v as { conversas?: unknown }).conversas);
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
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        "flex min-h-10 flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold transition-colors",
        ativa ? "border-b-2 border-brand bg-brand-soft text-ink" : "text-muted hover:text-ink",
      )}
    >
      {label}
      <span className="text-xs font-normal text-faint">{quantidade}</span>
      {naoLidas > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded bg-brand px-1 text-xs font-semibold text-white">
          {naoLidas}
          <span className="sr-only"> não lidas</span>
        </span>
      )}
    </button>
  );
}

/**
 * Barra de bandeiras em cima da busca: uma bolinha por estágio, na cor que o
 * estágio já tem em todo o sistema, com quantas conversas estão nele.
 *
 * Marca mais de uma para juntar estágios (qualificado + com interesse é a fila
 * de quem vale ligar hoje), e clicar de novo desmarca.
 */
function BarraBandeiras({
  contagem,
  ativas,
  onAlternar,
  onLimpar,
}: {
  contagem: Record<ConversaInteresse, number>;
  ativas: ConversaInteresse[];
  onAlternar: (bandeira: ConversaInteresse) => void;
  onLimpar: () => void;
}) {
  return (
    <div role="group" aria-label="Filtrar por estágio" className="mb-2 flex flex-wrap items-center gap-1">
      {ORDEM_BANDEIRAS.map((bandeira) => {
        const ativa = ativas.includes(bandeira);
        return (
          <button
            key={bandeira}
            type="button"
            onClick={() => onAlternar(bandeira)}
            aria-pressed={ativa}
            title={`${INTERESSE_LABEL[bandeira]} · ${contagem[bandeira]}`}
            aria-label={`Filtrar por ${INTERESSE_LABEL[bandeira]} — ${contagem[bandeira]} conversa(s)`}
            className={cn(
              "flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
              ativa
                ? "border-brand/60 bg-brand-soft text-ink"
                : "border-border text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[bandeira])} />
            {contagem[bandeira]}
          </button>
        );
      })}
      {ativas.length > 0 && (
        <button
          type="button"
          onClick={onLimpar}
          className="min-h-7 rounded-full px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          Todas
        </button>
      )}
    </div>
  );
}

/**
 * Inbox do WhatsApp: lista à esquerda, conversa à direita no desktop. No mobile
 * é uma tela por vez, como o app do celular: primeiro a lista; tocar numa
 * conversa abre só ela, com botão de voltar.
 *
 * A lista é paginada: chega a primeira página do servidor e "Carregar mais"
 * traz as seguintes. A busca vai ao servidor (nome, telefone e histórico),
 * porque conversa antiga pode não estar no que foi carregado.
 */
export function AtendimentoInbox({
  inicial,
  proximoInicial,
  conta,
  assinatura,
  enterEnviaInicial,
  conectado,
  podeResponder,
  podeApagar,
  cabecalho,
}: {
  inicial: ConversaResumo[];
  /** Cursor da segunda página da lista; null quando a primeira já é tudo. */
  proximoInicial: string | null;
  /** Conta logada — os rascunhos da aba são dela e de mais ninguém. */
  conta: string;
  /**
   * Login de quem está atendendo. A assinatura das respostas é colada no
   * servidor; aqui ela só faz a bolha otimista nascer igual ao que vai sair.
   */
  assinatura: string;
  /**
   * Preferência da conta (Enter envia ou quebra linha) como o servidor a
   * conhecia. Só o valor de partida: a chave logo abaixo do título muda o
   * comportamento da caixa na hora, e salva em segundo plano.
   */
  enterEnviaInicial: boolean;
  conectado: boolean;
  podeResponder: boolean;
  podeApagar: boolean;
  /** Abas + status da conexão; no mobile some junto com a lista ao abrir uma conversa. */
  cabecalho?: ReactNode;
}) {
  // Outra conta nesta aba (sem reload) não herda rascunho nenhum.
  usarConta(conta);

  // `?c=<id>` vem do link "Responder" da tabela de leads, da agenda e do sino.
  const params = useSearchParams();
  const alvo = params.get("c");
  // `?remarcar=<data da aula>` vem do "Convidar para remarcar" da agenda: abre a
  // conversa com o convite pronto para a recepção ler e enviar. A data viaja na
  // URL (e não o texto) para a mensagem morar num lugar só.
  const remarcar = params.get("remarcar");
  const convite =
    remarcar && ehDataISO(remarcar) ? { data: remarcar, texto: mensagemRemarcarAula(remarcar) } : undefined;

  const [conversas, setConversas] = useState(inicial);
  const [proximo, setProximo] = useState(proximoInicial);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroMais, setErroMais] = useState("");
  const inicialSelecionada = alvo && inicial.some((c) => c.id === alvo) ? alvo : null;
  const [aba, setAba] = useState<Aba>(
    inicial.find((c) => c.id === inicialSelecionada)?.ehGrupo ? "grupos" : "pessoas",
  );
  const [selecionada, setSelecionada] = useState<string | null>(
    inicialSelecionada ?? inicial.find((c) => !c.ehGrupo)?.id ?? inicial[0]?.id ?? null,
  );
  // No mobile decide qual tela aparece: a lista (false) ou a conversa (true).
  const [aberta, setAberta] = useState(inicialSelecionada !== null);
  const [enterEnvia, setEnterEnvia] = useState(enterEnviaInicial);
  const [salvandoEnter, setSalvandoEnter] = useState(false);
  // Ficha ao lado (telas largas) ou em diálogo (as demais).
  const [fichaLateral, setFichaLateral] = useState(false);
  const [fichaDialogo, setFichaDialogo] = useState(false);
  // Muda quando um rascunho aparece ou some, para a lista mostrar o aviso.
  const [, setVersaoRascunho] = useState(0);
  const empurrouHistorico = useRef(false);

  // Já no Atendimento, um link para `?c=<outra>` não remonta a página. Ajuste no
  // render: abre a conversa pedida se ela existe na lista (ou chegou agora no
  // `inicial` que o servidor refez com ela).
  const [alvoVisto, setAlvoVisto] = useState(alvo);
  if (alvo !== alvoVisto) {
    setAlvoVisto(alvo);
    const pedida =
      alvo !== null
        ? (conversas.find((c) => c.id === alvo) ?? inicial.find((c) => c.id === alvo) ?? null)
        : null;
    if (pedida) {
      setConversas((a) => {
        const lista = a.some((x) => x.id === pedida.id) ? a : [pedida, ...a];
        return lista.map((x) => (x.id === pedida.id ? { ...x, naoLidas: 0 } : x));
      });
      setAba(pedida.ehGrupo ? "grupos" : "pessoas");
      setSelecionada(pedida.id);
      setAberta(true);
    }
  }
  // Link para conversa que não existe (removida, ou id errado): diz isso, em vez
  // de abrir outra no lugar sem avisar.
  const alvoAusente =
    alvo !== null && !conversas.some((c) => c.id === alvo) && !inicial.some((c) => c.id === alvo);

  // Celular: ao abrir uma conversa o foco vai para ela (o título, não a caixa
  // de texto — não abre o teclado sozinho); ao voltar, para o item da lista.
  const tituloConversaRef = useRef<HTMLHeadingElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const abertaAntes = useRef(aberta);
  useEffect(() => {
    if (abertaAntes.current === aberta) return;
    abertaAntes.current = aberta;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    if (aberta) {
      tituloConversaRef.current?.focus({ preventScroll: true });
    } else if (selecionada) {
      listaRef.current
        ?.querySelector<HTMLElement>(`[data-conversa-id="${CSS.escape(selecionada)}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [aberta, selecionada]);

  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Achados>({ termo: "", estado: "ok", itens: [] });
  const [bandeiras, setBandeiras] = useState<ConversaInteresse[]>([]);

  // Enquanto o ponteiro ou o foco estão na lista, ninguém muda de lugar: a
  // conversa que sobe por mensagem nova faria o clique cair na de baixo.
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

  function entrarNaLista() {
    interagindo.current = true;
  }
  function sairDaLista() {
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

  // O botão voltar do celular fecha a conversa em vez de sair da página.
  useEffect(() => {
    const aoVoltar = () => {
      empurrouHistorico.current = false;
      setAberta(false);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  // Busca no servidor: espera a digitação parar. O resultado leva o termo que o
  // gerou; uma resposta antiga (de um termo já apagado) é descartada.
  const termo = busca.trim();
  useEffect(() => {
    if (termo.length < 2) return;
    const controle = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/whatsapp/conversas/busca?q=${encodeURIComponent(termo)}`, {
          cache: "no-store",
          signal: controle.signal,
        });
        const d = (await r.json().catch(() => null)) as { conversas?: ConversaBuscaItem[] } | null;
        if (controle.signal.aborted) return;
        if (r.ok && Array.isArray(d?.conversas)) {
          setAchados({ termo, estado: "ok", itens: d.conversas });
        } else {
          setAchados({ termo, estado: "erro", itens: [] });
        }
      } catch {
        if (!controle.signal.aborted) setAchados({ termo, estado: "erro", itens: [] });
      }
    }, 350);
    return () => {
      controle.abort();
      clearTimeout(t);
    };
  }, [termo]);

  const buscandoServidor = termo.length >= 2 && achados.termo !== termo;
  const erroBusca = termo.length >= 2 && achados.termo === termo && achados.estado === "erro";

  /**
   * A lista que a tela mostra. Sem busca, a inbox carregada. Com busca, o que
   * casou aqui mais o que o servidor achou — resultado de termo anterior não
   * entra.
   */
  const filtradas = useMemo<LinhaConversa[]>(() => {
    if (!termo) return conversas;
    const porId = new Map<string, LinhaConversa>();
    for (const c of conversas) if (casaConversa(c, termo)) porId.set(c.id, c);
    for (const a of achados.termo === termo ? achados.itens : []) {
      // A versão da lista está mais fresca; do achado interessa o trecho.
      porId.set(a.id, { ...(porId.get(a.id) ?? a), trecho: a.trecho || undefined });
    }
    return ordenarConversas([...porId.values()]);
  }, [conversas, achados, termo]);

  const pessoasBuscadas = filtradas.filter((c) => !c.ehGrupo);
  const contagemBandeiras = useMemo(() => contarBandeiras(pessoasBuscadas), [pessoasBuscadas]);
  const pessoas = filtrarPorBandeira(pessoasBuscadas, bandeiras);
  const grupos = filtradas.filter((c) => c.ehGrupo);
  const visiveis = aba === "grupos" ? grupos : pessoas;

  function alternarBandeira(bandeira: ConversaInteresse) {
    setBandeiras((atuais) =>
      atuais.includes(bandeira) ? atuais.filter((b) => b !== bandeira) : [...atuais, bandeira],
    );
  }

  function trocarAba(nova: Aba) {
    setAba(nova);
    const lista = nova === "grupos" ? grupos : pessoas;
    if (!lista.some((c) => c.id === selecionada)) setSelecionada(lista[0]?.id ?? null);
  }

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
    setSelecionada((s) => (s === id ? (restantes[0]?.id ?? null) : s));
    voltar();
  }

  function abrir(id: string) {
    // Aberta pela busca, a conversa passa a fazer parte da lista: limpar a
    // busca não a tira da tela no meio do atendimento.
    const achada = achados.itens.find((c) => c.id === id);
    setConversas((a) => {
      const lista = a.some((x) => x.id === id) || !achada ? a : [...a, achada];
      return lista.map((x) => (x.id === id ? { ...x, naoLidas: 0 } : x));
    });
    setSelecionada(id);
    setAberta(true);
    const mobile = !window.matchMedia("(min-width: 1024px)").matches;
    if (mobile && !empurrouHistorico.current) {
      window.history.pushState({ ...window.history.state, conversaAberta: true }, "");
      empurrouHistorico.current = true;
    }
  }

  function abrirFicha() {
    if (window.matchMedia(LARGURA_PAINEL_LATERAL).matches) setFichaLateral((v) => !v);
    else setFichaDialogo(true);
  }

  /** A chave fala em "quebra de linha"; o banco guarda o inverso. */
  async function mudarQuebraLinha(quebraLinha: boolean) {
    const novo = !quebraLinha;
    const anterior = enterEnvia;
    setEnterEnvia(novo);
    setSalvandoEnter(true);
    try {
      const r = await fetch("/api/perfil/preferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterEnvia: novo }),
      });
      if (!r.ok) setEnterEnvia(anterior);
    } catch {
      setEnterEnvia(anterior);
    } finally {
      setSalvandoEnter(false);
    }
  }

  function voltar() {
    if (empurrouHistorico.current) window.history.back();
    else setAberta(false);
  }

  if (conversas.length === 0 && !termo) {
    return (
      <>
        {cabecalho}
        <Card className="px-5 py-16 text-center">
          <p className="text-sm text-muted">
            {conectado
              ? "Nenhuma conversa ainda. Quando alguém chamar no WhatsApp, o lead e o histórico aparecem aqui sozinhos."
              : "Conecte o WhatsApp para começar a receber conversas."}
          </p>
          {alvoAusente && (
            <p className="mt-2 text-sm text-faint">A conversa do link não foi encontrada.</p>
          )}
        </Card>
      </>
    );
  }

  const fichaVisivel = !!atual?.personId && fichaLateral;

  return (
    // Ocupa exatamente a área útil do shell (globals.css): cabeçalho e chave
    // ficam no topo, lista e conversa dividem o resto e rolam por dentro.
    <div className="altura-area-util flex min-h-0 flex-col">
      <div className={cn("shrink-0", aberta && "hidden lg:block")}>
        {cabecalho}
        {podeResponder && (
          <div className="-mt-1 mb-3">
            <ChaveQuebraLinha
              ligada={!enterEnvia}
              salvando={salvandoEnter}
              onMudar={(v) => void mudarQuebraLinha(v)}
            />
          </div>
        )}
        {alvoAusente && (
          <p role="status" className="mb-3 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-ink">
            A conversa do link não foi encontrada — pode ter sido removida. Use a busca para procurar a pessoa.
          </p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_1fr]">
        <Card className={cn("h-full min-h-0 flex-col overflow-hidden", aberta ? "hidden lg:flex" : "flex")}>
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

          <div className="shrink-0 border-b border-border px-3 py-2">
            {aba === "pessoas" && (
              <BarraBandeiras
                contagem={contagemBandeiras}
                ativas={bandeiras}
                onAlternar={alternarBandeira}
                onLimpar={() => setBandeiras([])}
              />
            )}
            <div className="relative">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                type="search"
                placeholder="Nome, telefone ou palavra…"
                aria-label="Buscar conversa por nome, telefone ou palavra do histórico"
                className="min-h-9 w-full rounded-lg border border-control bg-surface px-3 py-1.5 pr-8 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-brand sm:text-sm"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  aria-label="Limpar busca"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-faint transition-colors hover:text-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {/* O estado da busca no servidor fica dito, não adivinhado. */}
            <p role="status" className="mt-1.5 min-h-4 text-xs text-faint">
              {termo.length === 1
                ? "Digite mais uma letra para procurar no histórico."
                : buscandoServidor
                  ? "Procurando em todas as conversas…"
                  : erroBusca
                    ? ""
                    : termo
                      ? `${visiveis.length} resultado${visiveis.length === 1 ? "" : "s"}`
                      : ""}
            </p>
            {erroBusca && (
              <MensagemErro className="text-xs">
                A busca no servidor falhou. Mostrando só o que já estava carregado.
              </MensagemErro>
            )}
          </div>

          <ul
            ref={listaRef}
            aria-label="Conversas"
            onPointerEnter={entrarNaLista}
            onPointerLeave={sairDaLista}
            onFocus={entrarNaLista}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) sairDaLista();
            }}
            className="flex-1 overflow-y-auto"
          >
            {visiveis.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted">
                {termo
                  ? buscandoServidor
                    ? "Procurando em todas as conversas…"
                    : erroBusca
                      ? "Nada na lista carregada. A busca completa falhou — tente de novo em instantes."
                      : `Nada encontrado para “${termo}”${bandeiras.length ? " nas bandeiras marcadas" : ""}. A busca cobre nome, telefone e o que foi escrito nas conversas.`
                  : aba === "grupos"
                    ? "Nenhum grupo por aqui ainda. O grupo entra nesta aba na primeira mensagem nova que chegar nele — conversa anterior não é importada."
                    : bandeiras.length
                      ? "Nenhuma conversa nas bandeiras marcadas. Desmarque (ou toque em “Todas”) para ver a lista inteira."
                      : "Nenhuma conversa individual carregada."}
              </li>
            )}
            {visiveis.map((c) => {
              const ativo = c.id === selecionada;
              const rascunho = c.id !== selecionada && temRascunho(c.id);
              return (
                <li
                  key={c.id}
                  className={cn(
                    "border-b border-border transition-colors last:border-0",
                    ativo ? "bg-brand-soft" : "hover:bg-surface-2",
                  )}
                >
                  <button
                    type="button"
                    data-conversa-id={c.id}
                    onClick={() => abrir(c.id)}
                    aria-current={ativo ? "true" : undefined}
                    className="flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left"
                  >
                    <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PONTO[c.interesse])} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{c.nome}</span>
                        <span className="shrink-0 text-xs text-faint">{quando(c.ultimaMensagemEm)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted">
                          {rascunho ? (
                            <span className="font-semibold text-brand">Rascunho · </span>
                          ) : null}
                          {c.trecho ? trechoAoRedor(c.trecho, termo) : c.preview || c.telefone}
                        </span>
                        {c.naoLidas > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-brand px-1 text-xs font-semibold text-white">
                            {c.naoLidas}
                            <span className="sr-only"> não lidas</span>
                          </span>
                        )}
                      </span>
                      {!c.ehGrupo && c.interesse !== "nao_classificado" && (
                        <span className="mt-1 block text-xs text-faint">{INTERESSE_LABEL[c.interesse]}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {!termo && proximo && (
              <li className="px-3 py-3">
                <Botao bloco tamanho="sm" onClick={() => void carregarMais()} carregando={carregandoMais}>
                  {carregandoMais ? "Carregando…" : "Carregar mais conversas"}
                </Botao>
                {erroMais && <MensagemErro className="mt-2 text-xs">{erroMais}</MensagemErro>}
              </li>
            )}
          </ul>
        </Card>

        <Card className={cn("h-full min-h-0 overflow-hidden", aberta ? "flex" : "hidden lg:flex")}>
          {atual ? (
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Quem é, em cima da conversa — e o acesso à ficha sem sair dela. */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
                <button
                  type="button"
                  onClick={voltar}
                  aria-label="Voltar para as conversas"
                  className="-ml-1 rounded-lg p-2 text-muted transition-colors hover:text-ink lg:hidden"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[atual.interesse])} />
                <span className="min-w-0 flex-1">
                  <h2
                    ref={tituloConversaRef}
                    tabIndex={-1}
                    className="block truncate rounded text-sm font-semibold text-ink outline-none"
                  >
                    {atual.nome}
                  </h2>
                  <span className="block truncate text-xs text-muted">
                    {atual.ehGrupo
                      ? "Grupo"
                      : [atual.telefone, INTERESSE_LABEL[atual.interesse]].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {atual.personId && (
                  <Botao
                    tamanho="sm"
                    variante={fichaVisivel ? "contorno" : "secundario"}
                    onClick={abrirFicha}
                    aria-expanded={fichaVisivel || fichaDialogo}
                  >
                    Ficha
                  </Botao>
                )}
              </div>
              <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                  <ConversaPainel
                    key={atual.id}
                    conversa={atual}
                    // Só a conversa que veio no link recebe o convite pronto.
                    convite={atual.id === alvo ? convite : undefined}
                    assinatura={assinatura}
                    enterEnvia={enterEnvia}
                    podeResponder={podeResponder}
                    podeApagar={podeApagar}
                    onConversaAtualizada={atualizarConversa}
                    onConversaRemovida={removerConversa}
                    onRascunhoMudou={() => setVersaoRascunho((n) => n + 1)}
                  />
                </div>
                {fichaVisivel && atual.personId && (
                  <aside
                    aria-label={`Ficha de ${atual.nome}`}
                    className="hidden w-72 shrink-0 overflow-y-auto border-l border-border p-4 xl:block"
                  >
                    <ContextoPessoa key={atual.personId} personId={atual.personId} conversaId={atual.id} />
                  </aside>
                )}
              </div>
            </div>
          ) : (
            <p className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-muted">
              Escolha uma conversa à esquerda.
            </p>
          )}
        </Card>
      </div>

      {fichaDialogo && atual?.personId && (
        <Modal onFechar={() => setFichaDialogo(false)} className="max-w-sm">
          <div className="flex items-center justify-between gap-3">
            <TituloModal>Ficha</TituloModal>
            <Botao variante="discreto" tamanho="sm" onClick={() => setFichaDialogo(false)}>
              Fechar
            </Botao>
          </div>
          <ContextoPessoa personId={atual.personId} conversaId={atual.id} className="mt-4" />
        </Modal>
      )}
    </div>
  );
}
