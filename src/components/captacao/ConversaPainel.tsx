"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type TouchEvent,
} from "react";
import { useRouter } from "next/navigation";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Bandeira } from "@/components/ui/Bandeira";
import { RespostasProntas } from "@/components/captacao/RespostasProntas";
import { AulaExperimentalPainel } from "@/components/captacao/AulaExperimentalPainel";
import { GravadorAudio } from "@/components/captacao/GravadorAudio";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import { deveEnviarNoEnter, dicaComposer } from "@/lib/whatsapp/atalho-envio";
import { prefixoAssinatura } from "@/lib/whatsapp/assinatura";
import { cn } from "@/lib/cn";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";
import {
  codificarCursor,
  confirmarOtimista,
  cursorDeNovidades,
  marcarOtimista,
  mesclarMensagens,
  novoIdOtimista,
  primeiraConfirmada,
  type MensagemTela,
} from "@/lib/whatsapp/historico";
import {
  apagarRascunho,
  conviteTratado,
  guardarRascunho,
  lerRascunho,
  marcarConviteTratado,
} from "@/lib/whatsapp/rascunhos";
import { lerResultado, sinalDeTempo, temOk } from "@/lib/operacao";
import {
  INTERESSE_LABEL,
  type CitacaoItem,
  type ConversaInteresse,
  type ConversaResumo,
  type LeadEstagio,
  type MensagemItem,
} from "@/lib/types";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";

/** Rede de segurança: o SSE traz em tempo real; isto cobre um stream caído. */
const FALLBACK_THREAD_MS = 60_000;

/** Quanto tempo a mensagem fica acesa depois de pular até ela. */
const DESTAQUE_MS = 1_600;

/** A quantos pixels do fim ainda conta como "lendo o fim". */
const FOLGA_FIM_PX = 48;

/** Teto de voltas de uma recuperação de novidades (cada uma com até 200). */
const VOLTAS_NOVIDADES = 20;

/**
 * As 5 flags de classificação, na ordem do funil (a mesma das abas da
 * Captação). Um toque na bandeira classifica — sem gaveta, sem formulário.
 * Classificar como "Convertido" não matricula ninguém: matrícula é outra
 * operação, com revisão e confirmação próprias.
 */
const FLAGS: { interesse: ConversaInteresse; estagio: LeadEstagio }[] = [
  { interesse: "nao_classificado", estagio: "novo" },
  { interesse: "sem_interesse", estagio: "qualificado" },
  { interesse: "com_interesse", estagio: "interesse" },
  { interesse: "convertido", estagio: "convertido" },
  { interesse: "perdido", estagio: "perdido" },
];

function agoraISO() {
  return new Date().toISOString();
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type RespostaPagina = { mensagens: MensagemItem[]; temAnteriores?: boolean; temMais?: boolean };

function ehPagina(v: unknown): v is RespostaPagina {
  return typeof v === "object" && v !== null && Array.isArray((v as RespostaPagina).mensagens);
}

type RespostaEnvio = RespostaPagina & { mensagem?: MensagemItem | null };

function mensagemDoCorpo(corpo: Record<string, unknown>): MensagemItem | null {
  const m = corpo.mensagem as MensagemItem | null | undefined;
  return m && typeof m.id === "string" ? m : null;
}

/** Histórico da conversa + resposta manual + classificação do atendimento. */
export function ConversaPainel({
  conversa,
  assinatura,
  enterEnvia,
  convite,
  podeResponder,
  podeApagar,
  onConversaAtualizada,
  onConversaRemovida,
  onRascunhoMudou,
}: {
  conversa: ConversaResumo;
  /**
   * Convite de remarcação pedido pela agenda. É intenção de preparar texto,
   * nunca de enviar: cai na caixa (ou, havendo rascunho, pergunta antes).
   */
  convite?: { data: string; texto: string };
  /**
   * Login de quem atende. A assinatura de verdade é colada no servidor; aqui
   * ela serve só para a bolha otimista já nascer igual ao que vai sair.
   */
  assinatura: string;
  /** Preferência de teclado da conta: Enter envia, ou quebra linha. */
  enterEnvia: boolean;
  podeResponder: boolean;
  /** Limpar/remover apagam trilha de atendimento — só ADMIN. */
  podeApagar: boolean;
  onConversaAtualizada: (c: ConversaResumo) => void;
  onConversaRemovida: (id: string) => void;
  /** Avisa a lista quando o rascunho desta conversa aparece ou some. */
  onRascunhoMudou?: () => void;
}) {
  const prefixo = prefixoAssinatura(assinatura);
  const conversaId = conversa.id;

  // O rascunho desta conversa (se houver) volta para a caixa — nunca é enviado
  // ao voltar. O convite pedido pela agenda só entra sozinho com a caixa vazia.
  const [inicio] = useState(() => {
    const r = lerRascunho(conversaId);
    const conviteNovo = convite && !conviteTratado(conversaId, convite.data) ? convite : null;
    const temTexto = !!r?.texto.trim();
    return {
      texto: !temTexto && conviteNovo ? conviteNovo.texto : (r?.texto ?? ""),
      citando: r?.citando ?? null,
      // Rascunho diferente do convite: a escolha é de quem atende.
      conviteEmEspera: temTexto && conviteNovo && r?.texto !== conviteNovo.texto ? conviteNovo : null,
      conviteCarregado: !temTexto && conviteNovo ? conviteNovo : null,
    };
  });

  const [mensagens, setMensagens] = useState<MensagemTela[]>([]);
  const [temAnteriores, setTemAnteriores] = useState(false);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [erroAnteriores, setErroAnteriores] = useState("");
  const [texto, setTextoEstado] = useState(inicio.texto);
  const [conviteEmEspera, setConviteEmEspera] = useState(inicio.conviteEmEspera);
  const [anexando, setAnexando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erroAbertura, setErroAbertura] = useState("");
  const [confirmando, setConfirmando] = useState<"limpar" | "remover" | null>(null);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState("");
  const [classificando, setClassificando] = useState(false);
  const [mostrandoRespostas, setMostrandoRespostas] = useState(false);
  const [mostrandoAula, setMostrandoAula] = useState(false);
  const [aberturasAula, setAberturasAula] = useState(0);
  const [citando, setCitandoEstado] = useState<MensagemItem | null>(inicio.citando);
  const [destacada, setDestacada] = useState<string | null>(null);
  const [novasAbaixo, setNovasAbaixo] = useState(0);

  const rolagem = useRef<HTMLDivElement>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const mensagensRef = useRef<MensagemTela[]>([]);
  useLayoutEffect(() => {
    mensagensRef.current = mensagens;
  }, [mensagens]);
  const enviandoBinario = useRef(false);
  // Se a pessoa lia o fim antes da última atualização (a pintura nova já mudou a altura).
  const estaNoFimAntes = useRef(true);

  // O convite carregado sozinho conta como tratado: voltar a esta conversa não
  // o escreve de novo por cima do que a pessoa editou.
  useEffect(() => {
    if (inicio.conviteCarregado) marcarConviteTratado(conversaId, inicio.conviteCarregado.data);
  }, [conversaId, inicio.conviteCarregado]);

  const temConteudo = texto.trim().length > 0;
  const temRascunhoAgora = temConteudo || !!citando;
  const avisouRascunho = useRef(temRascunhoAgora);
  useEffect(() => {
    if (avisouRascunho.current !== temRascunhoAgora) {
      avisouRascunho.current = temRascunhoAgora;
      onRascunhoMudou?.();
    }
  }, [temRascunhoAgora, onRascunhoMudou]);

  function setTexto(t: string) {
    setTextoEstado(t);
    guardarRascunho(conversaId, { texto: t, citando });
  }
  function setCitando(m: MensagemItem | null) {
    setCitandoEstado(m);
    guardarRascunho(conversaId, { texto, citando: m });
  }

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

  /* ---------- citação ---------- */

  function autorDe(m: MensagemItem): string | null {
    if (m.direcao === "OUT") return m.autorNome ?? "Você";
    return m.remetente ?? conversa.nome;
  }

  function citar(m: MensagemItem) {
    setCitando(m);
    caixa.current?.focus();
  }

  function irPara(id: string) {
    const alvo = document.getElementById(`msg-${id}`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    setDestacada(id);
    setTimeout(() => setDestacada((a) => (a === id ? null : a)), DESTAQUE_MS);
  }

  function citacaoOtimista(): CitacaoItem | null {
    if (!citando) return null;
    return { id: citando.id, texto: citando.texto, autor: autorDe(citando) };
  }

  /* ---------- envio ---------- */

  async function responder() {
    const conteudo = texto.trim();
    if (!conteudo) return;
    setErro("");
    const citada = citacaoOtimista();
    const citarId = citando?.id;
    // Libera a caixa na hora; o que for digitado daqui em diante é outra
    // mensagem, e a resposta deste envio nunca mexe nela.
    setTextoEstado("");
    setCitandoEstado(null);
    apagarRascunho(conversaId);

    const tempId = novoIdOtimista();
    const otimista: MensagemTela = {
      id: tempId,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorNome: null,
      remetente: null,
      texto: conteudo.startsWith(prefixo.trimEnd()) ? conteudo : prefixo + conteudo,
      tipoMidia: "texto",
      enviadaEm: agoraISO(),
      erro: null,
      citavel: false, // ainda não existe no WhatsApp: citar não teria a quem apontar
      citada,
      envio: "enviando",
    };
    pedidoRolagem.current = { tipo: "fim" };
    setMensagens((antigas) => [...antigas, otimista]);

    const res = await lerResultado(
      fetch(`/api/whatsapp/conversas/${conversaId}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo, ...(citarId ? { citarId } : {}) }),
        signal: sinalDeTempo(),
      }),
      (v): v is RespostaEnvio => ehPagina(v),
      "Não foi possível enviar.",
    );

    if (res.tipo === "ok") {
      setMensagens((a) => confirmarOtimista(a, tempId, res.dados.mensagem ?? null, res.dados.mensagens));
      return;
    }
    if (res.tipo === "falha") {
      // A bolha de erro que o servidor gravou toma o lugar da otimista.
      const gravada = mensagemDoCorpo(res.corpo);
      setMensagens((a) =>
        gravada ? confirmarOtimista(a, tempId, gravada) : marcarOtimista(a, tempId, "falhou", res.erro),
      );
      setErro(res.erro);
      return;
    }
    setMensagens((a) => marcarOtimista(a, tempId, "incerto", null));
    setErro("Sem confirmação do servidor. A mensagem pode ter saído — confira a conversa antes de enviar de novo.");
  }

  /**
   * Texto de uma bolha que falhou de volta à caixa — só com a caixa vazia: o
   * que já foi digitado depois nunca é apagado para dar lugar ao antigo.
   */
  function recolocar(m: MensagemTela) {
    if (temConteudo) return;
    const semAssinatura = m.texto.startsWith(prefixo) ? m.texto.slice(prefixo.length) : m.texto;
    setTexto(semAssinatura);
    caixa.current?.focus();
  }

  /**
   * Anexo (imagem/PDF, com o texto digitado de legenda) e áudio gravado (sem
   * legenda). O resultado entra no histórico carregado — não o substitui.
   */
  async function enviarBinario(arquivo: File, { comLegenda }: { comLegenda: boolean }) {
    if (enviandoBinario.current) return;
    enviandoBinario.current = true;
    setAnexando(true);
    setErro("");
    const legenda = comLegenda && temConteudo ? texto.trim() : "";
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      if (legenda) form.append("texto", legenda);
      if (citando) form.append("citarId", citando.id);
      const res = await lerResultado(
        fetch(`/api/whatsapp/conversas/${conversaId}/mensagens`, {
          method: "POST",
          body: form,
          signal: sinalDeTempo(),
        }),
        (v): v is RespostaEnvio => ehPagina(v),
        "Não foi possível enviar.",
      );
      if (res.tipo === "ok") {
        pedidoRolagem.current = { tipo: "fim" };
        setMensagens((a) =>
          mesclarMensagens(a, res.dados.mensagem ? [...res.dados.mensagens, res.dados.mensagem] : res.dados.mensagens),
        );
        setCitando(null);
        // A legenda só sai da caixa se foi junto — e se a caixa não mudou.
        if (legenda && texto.trim() === legenda) setTexto("");
      } else if (res.tipo === "falha") {
        setErro(res.erro);
        void buscarNovidades(); // a falha fica registrada na conversa
      } else {
        setErro(
          "Sem confirmação do servidor. O arquivo pode ter sido enviado — confira a conversa antes de enviar de novo.",
        );
        void buscarNovidades();
      }
    } finally {
      enviandoBinario.current = false;
      setAnexando(false);
    }
  }

  async function enviarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!arquivo) return;
    await enviarBinario(arquivo, { comLegenda: true });
  }

  /* ---------- administração ---------- */

  async function apagar() {
    const tipo = confirmando;
    if (!tipo || apagando) return;
    setApagando(true);
    setErroApagar("");
    const url =
      tipo === "limpar"
        ? `/api/whatsapp/conversas/${conversaId}/mensagens`
        : `/api/whatsapp/conversas/${conversaId}`;
    const res = await lerResultado(fetch(url, { method: "DELETE" }), temOk, "Não foi possível concluir.");
    setApagando(false);
    if (res.tipo === "ok") {
      setConfirmando(null);
      if (tipo === "limpar") {
        setMensagens([]);
        setTemAnteriores(false);
      } else {
        onConversaRemovida(conversaId);
      }
      return;
    }
    setErroApagar(res.tipo === "falha" ? res.erro : "Sem confirmação do servidor. Recarregue a conversa para ver o estado atual.");
  }

  /** Um toque na bandeira classifica e move o lead no funil na hora. */
  async function classificar(interesse: ConversaInteresse) {
    if (classificando || interesse === conversa.interesse) return;
    setClassificando(true);
    setErro("");
    const res = await lerResultado(
      fetch(`/api/whatsapp/conversas/${conversaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interesse }),
      }),
      (v): v is { conversa: ConversaResumo } =>
        typeof v === "object" && v !== null && typeof (v as { conversa?: { id?: unknown } }).conversa?.id === "string",
      "Não foi possível classificar.",
    );
    setClassificando(false);
    if (res.tipo === "ok") {
      onConversaAtualizada(res.dados.conversa);
      router.refresh(); // a Captação lê o estágio do servidor
    } else {
      setErro(res.tipo === "falha" ? res.erro : "Sem confirmação da classificação. Confira a bandeira antes de tocar de novo.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {(podeApagar || podeResponder || !conversa.ehGrupo) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {!conversa.ehGrupo && (
              <div className="flex items-center gap-0.5" role="group" aria-label="Classificar lead">
                {FLAGS.map((f) => {
                  const ativa = conversa.interesse === f.interesse;
                  return (
                    <button
                      type="button"
                      key={f.interesse}
                      onClick={() => void classificar(f.interesse)}
                      disabled={classificando}
                      title={INTERESSE_LABEL[f.interesse]}
                      aria-label={`Classificar como ${INTERESSE_LABEL[f.interesse]}`}
                      aria-pressed={ativa}
                      className={cn(
                        "rounded-md p-1.5 transition-all",
                        ativa ? "bg-surface-2 ring-1 ring-border-strong" : "opacity-40 hover:opacity-90 focus-visible:opacity-100",
                        classificando && "cursor-wait",
                      )}
                    >
                      <Bandeira estagio={f.estagio} />
                    </button>
                  );
                })}
              </div>
            )}
            {podeResponder && (
              <button
                type="button"
                onClick={() => {
                  setMostrandoRespostas((a) => !a);
                  setMostrandoAula(false);
                }}
                aria-expanded={mostrandoRespostas}
                className="flex min-h-8 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                Respostas prontas
                <span aria-hidden className={cn("text-xs transition-transform", mostrandoRespostas && "rotate-180")}>
                  ▼
                </span>
              </button>
            )}
            {podeResponder && !conversa.ehGrupo && (
              <button
                type="button"
                onClick={() => {
                  const abrindo = !mostrandoAula;
                  setMostrandoAula(abrindo);
                  if (abrindo) setAberturasAula((n) => n + 1);
                  setMostrandoRespostas(false);
                }}
                aria-expanded={mostrandoAula}
                className="flex min-h-8 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                Aula experimental
                <span aria-hidden className={cn("text-xs transition-transform", mostrandoAula && "rotate-180")}>
                  ▼
                </span>
              </button>
            )}
          </div>
          {podeApagar && (
            <div className="flex items-center gap-1">
              <Botao variante="discreto" tamanho="sm" onClick={() => setConfirmando("limpar")}>
                Limpar
              </Botao>
              <Botao variante="discreto" tamanho="sm" onClick={() => setConfirmando("remover")} className="hover:text-danger">
                Remover
              </Botao>
            </div>
          )}
        </div>
      )}

      {confirmando && (
        <ConfirmarExclusao
          tipo={confirmando}
          nome={conversa.nome}
          apagando={apagando}
          erro={erroApagar}
          onCancelar={() => {
            if (apagando) return;
            setConfirmando(null);
            setErroApagar("");
          }}
          onConfirmar={() => void apagar()}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={rolagem} onScroll={aoRolar} className="h-full overflow-y-auto px-3 py-3 sm:px-4">
          {carregando ? (
            <p className="py-10 text-center text-sm text-muted">Carregando conversa…</p>
          ) : erroAbertura ? (
            <MensagemErro className="justify-center py-10">{erroAbertura}</MensagemErro>
          ) : mensagens.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nenhuma mensagem ainda.</p>
          ) : (
            <>
              {temAnteriores && (
                <div className="mb-3 flex flex-col items-center gap-1.5">
                  <Botao tamanho="sm" onClick={() => void carregarAnteriores()} carregando={carregandoAnteriores}>
                    {carregandoAnteriores ? "Carregando…" : "Carregar mensagens anteriores"}
                  </Botao>
                  {erroAnteriores && <MensagemErro className="text-xs">{erroAnteriores}</MensagemErro>}
                </div>
              )}
              {!temAnteriores && (
                <p className="mb-3 text-center text-xs text-faint">Início da conversa</p>
              )}
              <div className="flex flex-col gap-2">
                {mensagens.map((m) => (
                  <Bolha
                    key={m.id}
                    mensagem={m}
                    destacada={destacada === m.id}
                    onCitar={podeResponder ? () => citar(m) : undefined}
                    onIrPara={irPara}
                    onRecolocar={podeResponder && !temConteudo ? () => recolocar(m) : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        {/* Novidade enquanto se lê acima: avisa, não puxa a tela nem o foco. */}
        <div role="status" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          {novasAbaixo > 0 && (
            <button
              type="button"
              onClick={irParaFim}
              className="pointer-events-auto rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow-overlay)] hover:bg-brand-hover"
            >
              {novasAbaixo === 1 ? "1 mensagem nova" : `${novasAbaixo} mensagens novas`} ↓
            </button>
          )}
        </div>
      </div>

      {podeResponder && (
        <RespostasProntas
          aberto={mostrandoRespostas}
          onEscolher={(t) => {
            // Escolher nunca envia, e nunca apaga o que já estava escrito.
            setTexto(temConteudo ? `${texto.trimEnd()}\n\n${t}` : t);
            setMostrandoRespostas(false);
            caixa.current?.focus();
          }}
        />
      )}

      {podeResponder && !conversa.ehGrupo && (
        <AulaExperimentalPainel
          key={aberturasAula}
          aberto={mostrandoAula}
          conversaId={conversaId}
          nome={conversa.nome}
          telefone={conversa.telefone}
          onMensagens={(novas) => {
            pedidoRolagem.current = { tipo: "fim" };
            setMensagens((a) => mesclarMensagens(a, novas));
          }}
          // Fica aberto com a confirmação à vista; quem fecha é a recepção.
          onAgendada={() => undefined}
          onFechar={() => setMostrandoAula(false)}
        />
      )}

      <div className="border-t border-border px-3 py-3 sm:px-4">
        {podeResponder ? (
          <>
            {conviteEmEspera && (
              <div role="status" className="mb-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-ink">
                <p>Há um convite para remarcar a aula pronto, mas a caixa já tem um rascunho.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Botao
                    tamanho="sm"
                    variante="contorno"
                    onClick={() => {
                      setTexto(conviteEmEspera.texto);
                      marcarConviteTratado(conversaId, conviteEmEspera.data);
                      setConviteEmEspera(null);
                      caixa.current?.focus();
                    }}
                  >
                    Trocar pelo convite
                  </Botao>
                  <Botao
                    tamanho="sm"
                    onClick={() => {
                      marcarConviteTratado(conversaId, conviteEmEspera.data);
                      setConviteEmEspera(null);
                    }}
                  >
                    Manter meu rascunho
                  </Botao>
                </div>
              </div>
            )}
            {citando && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-border border-l-2 border-l-brand bg-surface-2 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-destaque">Respondendo a {autorDe(citando) ?? "mensagem"}</p>
                  <p className="truncate text-xs text-muted">{citando.texto}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCitando(null)}
                  aria-label="Cancelar citação"
                  className="-mr-1 shrink-0 rounded p-1.5 text-faint transition-colors hover:text-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => void enviarArquivo(e)}
                className="hidden"
              />
              {!gravando && (
                <button
                  type="button"
                  onClick={() => inputArquivo.current?.click()}
                  disabled={anexando}
                  title="Anexar imagem ou PDF"
                  aria-label="Anexar imagem ou PDF"
                  className="shrink-0 self-end rounded-lg border border-border-strong p-2.5 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              )}

              <GravadorAudio
                desabilitado={anexando}
                onEstado={setGravando}
                onGravado={(audio) => void enviarBinario(audio, { comLegenda: false })}
                onErro={setErro}
              />

              {!gravando && (
                <textarea
                  ref={caixa}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  aria-label={`Resposta para ${conversa.nome}`}
                  onKeyUp={(e) => {
                    if (e.key === "Escape" && citando) setCitando(null);
                  }}
                  onKeyDown={(e) => {
                    const enviar = deveEnviarNoEnter(
                      {
                        key: e.key,
                        shiftKey: e.shiftKey,
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                        isComposing: e.nativeEvent.isComposing,
                      },
                      enterEnvia,
                    );
                    if (!enviar) return;
                    e.preventDefault();
                    if (!anexando && temConteudo) void responder();
                  }}
                  rows={2}
                  placeholder={dicaComposer(enterEnvia)}
                  className={cn(classeCampo, "max-h-40 min-h-11 flex-1 resize-none")}
                />
              )}
              {!gravando && (
                <button
                  type="button"
                  onClick={() => void responder()}
                  disabled={anexando || !temConteudo}
                  title="Enviar"
                  aria-label="Enviar"
                  className={cn(
                    "shrink-0 self-end rounded-lg p-2.5 transition-colors",
                    anexando || !temConteudo
                      ? "cursor-not-allowed bg-surface-2 text-faint"
                      : "bg-brand text-white hover:bg-brand-hover",
                  )}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 22-7z" />
                  </svg>
                </button>
              )}
            </div>
            {anexando && <p role="status" className="mt-2 text-xs text-muted">Enviando arquivo…</p>}
            {erro && <MensagemErro className="mt-2">{erro}</MensagemErro>}
          </>
        ) : (
          <p className="text-center text-xs text-muted">Seu perfil pode ler o histórico, mas não responder.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmação de ação destrutiva. Deixa explícito o que sobrevive a cada uma —
 * "limpar" e "remover" soam parecidos e têm consequências bem diferentes.
 * Fecha só depois que o servidor confirmou.
 */
function ConfirmarExclusao({
  tipo,
  nome,
  apagando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  tipo: "limpar" | "remover";
  nome: string;
  apagando: boolean;
  erro: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const limpando = tipo === "limpar";
  return (
    <Modal onFechar={onCancelar} fecharComEsc={!apagando}>
      <TituloModal>{limpando ? "Limpar conversa" : "Remover conversa"}</TituloModal>
      <DescricaoModal className="mt-2">
        {limpando ? (
          <>
            Apaga as mensagens de <strong className="text-ink">{nome}</strong>. A conversa continua na lista, com o
            lead e o histórico de atendimento intactos.
          </>
        ) : (
          <>
            Remove a conversa de <strong className="text-ink">{nome}</strong> com as mensagens e os registros de
            atendimento. O cadastro do lead <strong className="text-ink">não</strong> é apagado e continua no funil.
          </>
        )}
      </DescricaoModal>
      <p className="mt-2 text-xs text-muted">
        {limpando
          ? "Não dá para desfazer por aqui — fica uma cópia no backup do sistema."
          : "Não dá para desfazer por aqui — fica uma cópia no backup do sistema. Se a pessoa escrever de novo, uma conversa nova aparece."}
      </p>
      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}
      <div className="mt-5 flex gap-3">
        <Botao variante="perigo" onClick={onConfirmar} carregando={apagando} className="flex-1">
          {apagando ? "Apagando…" : limpando ? "Limpar" : "Remover"}
        </Botao>
        <Botao onClick={onCancelar} disabled={apagando}>
          Cancelar
        </Botao>
      </div>
    </Modal>
  );
}

const ROTULOS = new Set(Object.values(ROTULO_MIDIA));

/**
 * Mídia buscada sob demanda: o Coliseu não guarda foto nem áudio de conversa,
 * pede à Evolution na hora de exibir. Imagem carrega quando entra na tela
 * (`lazy`); áudio e vídeo só ao dar play (`preload="none"`).
 *
 * Mídia antiga expira no WhatsApp; quando o download falha, a bolha volta a ser
 * o rótulo, em vez de um ícone quebrado.
 */
function Midia({ mensagem }: { mensagem: MensagemItem }) {
  const [falhou, setFalhou] = useState(false);
  const url = `/api/whatsapp/mensagens/${mensagem.id}/midia`;

  if (falhou) {
    return (
      <p className="text-xs text-muted">
        {mensagem.texto} · não foi possível carregar; veja pelo aparelho
      </p>
    );
  }

  if (mensagem.tipoMidia === "imagem") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* Binário servido pela nossa API; otimização do Next não se aplica. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={mensagem.texto} loading="lazy" onError={() => setFalhou(true)} className="max-h-64 rounded-lg" />
      </a>
    );
  }

  if (mensagem.tipoMidia === "audio") {
    return <audio controls preload="none" src={url} onError={() => setFalhou(true)} className="w-60 max-w-full" />;
  }

  if (mensagem.tipoMidia === "video") {
    return <video controls preload="none" src={url} onError={() => setFalhou(true)} className="max-h-64 rounded-lg" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-destaque hover:underline">
      📎 Abrir documento
    </a>
  );
}

/**
 * O trecho citado dentro da bolha. Vira botão quando a original ainda está na
 * conversa; citação de mensagem já apagada continua legível, só não leva a
 * lugar nenhum.
 */
function TrechoCitado({ citacao, onIrPara }: { citacao: CitacaoItem; onIrPara?: (id: string) => void }) {
  const cls = "mb-1.5 block w-full rounded-md border-l-2 border-brand bg-bg/60 px-2 py-1 text-left";
  const conteudo = (
    <>
      {citacao.autor && <span className="block text-xs font-semibold text-destaque">{citacao.autor}</span>}
      <span className="line-clamp-2 break-words text-xs text-muted">{citacao.texto || "Mensagem"}</span>
    </>
  );

  const alvo = citacao.id;
  if (!alvo || !onIrPara) return <div className={cls}>{conteudo}</div>;
  return (
    <button
      type="button"
      onClick={() => onIrPara(alvo)}
      title="Ir para a mensagem citada"
      className={cn(cls, "transition-colors hover:bg-bg")}
    >
      {conteudo}
    </button>
  );
}

/** Arrastar do lado: onde começa a valer, o gatilho, e o quanto a bolha anda. */
const ARRASTO = { minimo: 8, gatilho: 48, teto: 72 };

/**
 * O que a bolha de saída diz sobre o envio. Só o que se sabe: o servidor não
 * informa entrega nem leitura no aparelho, então não há "entregue" nem "lida".
 */
function estadoEnvio(m: MensagemTela): { texto: string; tom: "neutro" | "falha" | "incerto" } | null {
  if (m.envio === "enviando") return { texto: "enviando…", tom: "neutro" };
  if (m.envio === "incerto") return { texto: "sem confirmação", tom: "incerto" };
  if (m.envio === "falhou" || m.erro) return { texto: "falha no envio", tom: "falha" };
  return null;
}

function Bolha({
  mensagem,
  destacada,
  onCitar,
  onIrPara,
  onRecolocar,
}: {
  mensagem: MensagemTela;
  destacada?: boolean;
  /** Ausente quando o perfil não responde — quem só lê não cita. */
  onCitar?: () => void;
  onIrPara?: (id: string) => void;
  /** Presente quando a caixa está vazia: o texto que não saiu pode voltar para ela. */
  onRecolocar?: () => void;
}) {
  const saida = mensagem.direcao === "OUT";
  const temMidia = mensagem.tipoMidia !== "texto" && !mensagem.erro;
  const legenda = temMidia && ROTULOS.has(mensagem.texto) ? "" : mensagem.texto;
  const podeCitar = !!onCitar && mensagem.citavel;
  const estado = saida ? estadoEnvio(mensagem) : null;
  const podeRecolocar = !!onRecolocar && !!estado && estado.tom !== "neutro" && mensagem.tipoMidia === "texto";

  const [arrasto, setArrasto] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);

  function aoTocar(e: TouchEvent) {
    if (!podeCitar) return;
    const t = e.touches[0];
    inicio.current = { x: t.clientX, y: t.clientY };
    horizontal.current = false;
  }

  function aoMover(e: TouchEvent) {
    const p = inicio.current;
    if (!p) return;
    const t = e.touches[0];
    const dx = t.clientX - p.x;
    const dy = t.clientY - p.y;
    if (!horizontal.current) {
      if (Math.abs(dx) < ARRASTO.minimo) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        inicio.current = null;
        return;
      }
      horizontal.current = true;
      setArrastando(true);
    }
    setArrasto(Math.max(0, Math.min(dx, ARRASTO.teto)));
  }

  function encerrar(citar: boolean) {
    if (citar && horizontal.current && arrasto >= ARRASTO.gatilho) onCitar?.();
    inicio.current = null;
    horizontal.current = false;
    setArrastando(false);
    setArrasto(0);
  }

  return (
    <div id={`msg-${mensagem.id}`} className={cn("group relative flex", saida ? "justify-end" : "justify-start")}>
      {arrasto > 0 && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 -translate-y-1/2 text-destaque"
          style={{ opacity: Math.min(1, arrasto / ARRASTO.gatilho) }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 17l-6-6 6-6" />
            <path d="M3 11h10a8 8 0 0 1 8 8v2" />
          </svg>
        </span>
      )}
      <div
        onTouchStart={aoTocar}
        onTouchMove={aoMover}
        onTouchEnd={() => encerrar(true)}
        onTouchCancel={() => encerrar(false)}
        style={{
          transform: arrasto ? `translateX(${arrasto}px)` : undefined,
          transition: arrastando ? "none" : "transform 150ms ease-out",
          touchAction: podeCitar ? "pan-y" : undefined,
        }}
        className={cn(
          "relative max-w-[85%] rounded-xl border px-3.5 py-2 sm:max-w-[75%]",
          saida ? "border-brand/25 bg-brand-soft" : "border-border bg-surface-2",
          estado?.tom === "falha" && "border-danger/50",
          estado?.tom === "incerto" && "border-warning/50",
          mensagem.envio === "enviando" && "opacity-75",
          destacada && "ring-2 ring-brand",
        )}
      >
        {podeCitar && (
          <button
            type="button"
            onClick={onCitar}
            title="Citar esta mensagem"
            aria-label="Citar esta mensagem"
            className={cn(
              "absolute -top-2 hidden rounded-full border border-border bg-surface p-1 text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 lg:block",
              saida ? "-left-2" : "-right-2",
            )}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 17l-6-6 6-6" />
              <path d="M3 11h10a8 8 0 0 1 8 8v2" />
            </svg>
          </button>
        )}
        {mensagem.citada && <TrechoCitado citacao={mensagem.citada} onIrPara={onIrPara} />}
        {/* Em grupo, quem falou importa tanto quanto o que foi dito. */}
        {!saida && mensagem.remetente && (
          <p className="mb-0.5 text-xs font-semibold text-destaque">{mensagem.remetente}</p>
        )}
        {temMidia && (
          <div className={cn(legenda && "mb-1.5")}>
            <Midia mensagem={mensagem} />
          </div>
        )}
        {legenda && <p className="whitespace-pre-wrap break-words text-sm text-ink">{legenda}</p>}
        <p className="mt-1 text-right text-xs text-muted">
          {saida && (mensagem.autorNome ?? (mensagem.envio ? "você" : "pelo aparelho"))}
          {saida && " · "}
          {hora(mensagem.enviadaEm)}
          {estado && (
            <span
              className={cn(
                estado.tom === "falha" && "font-medium text-danger",
                estado.tom === "incerto" && "font-medium text-warning",
              )}
            >
              {" · "}
              {estado.texto}
            </span>
          )}
        </p>
        {estado?.tom === "falha" && mensagem.erro && (
          <p className="mt-0.5 text-right text-xs text-danger">{mensagem.erro}</p>
        )}
        {podeRecolocar && (
          <div className="mt-1 text-right">
            <button type="button" onClick={onRecolocar} className="text-xs font-semibold text-destaque hover:underline">
              Recolocar texto na caixa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
