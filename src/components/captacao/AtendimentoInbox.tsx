"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { ConversaPainel } from "@/components/captacao/ConversaPainel";
import { ContextoPessoa } from "@/components/captacao/ContextoPessoa";
import { ChaveQuebraLinha } from "@/components/captacao/ChaveQuebraLinha";
import { CabecalhoConversa } from "@/components/captacao/inbox/CabecalhoConversa";
import { AbaBotao, BarraBandeiras, CampoBusca } from "@/components/captacao/inbox/FiltrosLista";
import { ListaConversas } from "@/components/captacao/inbox/ListaConversas";
import { useBuscaServidor } from "@/components/captacao/inbox/useBuscaServidor";
import { useListaConversas } from "@/components/captacao/inbox/useListaConversas";
import { somaNaoLidas, type LinhaConversa } from "@/components/captacao/inbox/visual";
import { cn } from "@/lib/cn";
import { casaConversa, contarBandeiras, filtrarPorBandeira } from "@/lib/whatsapp/busca";
import { ordenarConversas } from "@/lib/whatsapp/historico";
import { usarConta } from "@/lib/whatsapp/rascunhos";
import { ehDataISO, mensagemRemarcarAula } from "@/lib/aula-experimental";
import type { ConversaInteresse, ConversaResumo } from "@/lib/types";

/** Painel da ficha ao lado da conversa só cabe com folga a partir daqui. */
const LARGURA_PAINEL_LATERAL = "(min-width: 1280px)";

type Aba = "pessoas" | "grupos";

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

  const lista = useListaConversas(inicial, proximoInicial);
  const { conversas, setConversas } = lista;
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

  // O botão voltar do celular fecha a conversa em vez de sair da página.
  useEffect(() => {
    const aoVoltar = () => {
      empurrouHistorico.current = false;
      setAberta(false);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  const [busca, setBusca] = useState("");
  const [bandeiras, setBandeiras] = useState<ConversaInteresse[]>([]);
  const termo = busca.trim();
  const { achados, buscando, falhou } = useBuscaServidor(termo);

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
    const daAba = nova === "grupos" ? grupos : pessoas;
    if (!daAba.some((c) => c.id === selecionada)) setSelecionada(daAba[0]?.id ?? null);
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
            <CampoBusca busca={busca} onBusca={setBusca} quantos={visiveis.length} buscando={buscando} falhou={falhou} />
          </div>

          <ListaConversas
            listaRef={listaRef}
            visiveis={visiveis}
            selecionada={selecionada}
            termo={termo}
            buscando={buscando}
            falhou={falhou}
            grupos={aba === "grupos"}
            comBandeiras={bandeiras.length > 0}
            proximo={lista.proximo}
            carregandoMais={lista.carregandoMais}
            erroMais={lista.erroMais}
            onCarregarMais={() => void lista.carregarMais()}
            onAbrir={abrir}
            onEntrar={lista.entrar}
            onSair={lista.sair}
          />
        </Card>

        <Card className={cn("h-full min-h-0 overflow-hidden", aberta ? "flex" : "hidden lg:flex")}>
          {atual ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <CabecalhoConversa
                conversa={atual}
                tituloRef={tituloConversaRef}
                fichaVisivel={fichaVisivel}
                fichaAberta={fichaVisivel || fichaDialogo}
                onVoltar={voltar}
                onAbrirFicha={abrirFicha}
              />
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
