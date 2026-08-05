"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
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
  INTERESSE_LABEL,
  type CitacaoItem,
  type ConversaInteresse,
  type ConversaResumo,
  type LeadEstagio,
  type MensagemItem,
} from "@/lib/types";

/** Rede de segurança: o SSE traz em tempo real; isto cobre um stream caído. */
const FALLBACK_THREAD_MS = 60_000;

/** Quanto tempo a mensagem fica acesa depois de pular até ela. */
const DESTAQUE_MS = 1_600;

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/**
 * As 5 flags de classificação, na ordem do funil (a mesma das abas da
 * Captação). Um toque na bandeira classifica — sem gaveta, sem formulário.
 */
const FLAGS: { interesse: ConversaInteresse; estagio: LeadEstagio }[] = [
  { interesse: "nao_classificado", estagio: "novo" },
  { interesse: "sem_interesse", estagio: "qualificado" },
  { interesse: "com_interesse", estagio: "interesse" },
  { interesse: "convertido", estagio: "convertido" },
  { interesse: "perdido", estagio: "perdido" },
];

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Histórico da conversa + resposta manual + classificação do atendimento. */
export function ConversaPainel({
  conversa,
  assinatura,
  enterEnvia,
  textoInicial,
  podeResponder,
  podeApagar,
  onConversaAtualizada,
  onConversaRemovida,
}: {
  conversa: ConversaResumo;
  /**
   * Mensagem que já chega escrita na caixa (o "Não compareceu" da Captação).
   * Fica só na caixa: enviar continua sendo um clique de quem atende.
   */
  textoInicial?: string;
  /**
   * Login de quem atende. A assinatura de verdade é colada no servidor, na hora
   * de enviar (ver `@/lib/whatsapp/assinatura`); aqui ela serve só para a bolha
   * otimista já nascer igual ao que vai sair — sem ela, a mensagem apareceria
   * sem o nome e ganharia a assinatura meio segundo depois, piscando.
   */
  assinatura: string;
  /**
   * Preferência de teclado da conta (Perfil → Preferências): Enter envia a
   * resposta, ou quebra linha. Chega como prop porque quem sabe quem está
   * logado é a página, no servidor — a caixa só obedece.
   */
  enterEnvia: boolean;
  podeResponder: boolean;
  /** Limpar/remover apagam trilha de atendimento — só ADMIN. */
  podeApagar: boolean;
  onConversaAtualizada: (c: ConversaResumo) => void;
  onConversaRemovida: (id: string) => void;
}) {
  // Assinatura de quem atende: quem recebe no WhatsApp vê quem respondeu, já
  // que o número é o da academia. Ela não passa pela caixa de texto — quem cola
  // é o servidor, no envio. Aqui só se calcula o mesmo prefixo para a bolha
  // otimista sair igual à mensagem de verdade.
  const prefixo = prefixoAssinatura(assinatura);

  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [texto, setTexto] = useState(textoInicial ?? "");
  const [anexando, setAnexando] = useState(false);
  // Gravando, a linha do composer é toda do gravador (ver o bloco lá embaixo).
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState<"limpar" | "remover" | null>(null);
  // Um toque numa flag classifica; o disable evita toque duplo em voo.
  const [classificando, setClassificando] = useState(false);
  // Gaveta de respostas prontas, em cima da caixa de texto.
  const [mostrandoRespostas, setMostrandoRespostas] = useState(false);
  // Gaveta de aula experimental — mesma região, uma de cada vez: duas abertas
  // empurrariam a caixa de texto para fora da tela no celular. O contador vira
  // `key` do painel: cada abertura monta um agendamento novo, sem sobra do
  // anterior.
  const [mostrandoAula, setMostrandoAula] = useState(false);
  const [aberturasAula, setAberturasAula] = useState(0);
  // Mensagem que a próxima resposta cita — o "responder" do WhatsApp. Vale para
  // o que sair em seguida: texto, anexo ou áudio.
  const [citando, setCitando] = useState<MensagemItem | null>(null);
  // Acende por um instante a mensagem para onde a citação levou, senão o pulo
  // deixa a pessoa perdida no meio do histórico.
  const [destacada, setDestacada] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const temConteudo = texto.trim().length > 0;

  // Carrega o histórico ao montar. Trocar de conversa remonta o componente
  // (a lista passa `key={id}`), então não há estado antigo para limpar aqui.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/whatsapp/conversas/${conversa.id}`, { cache: "no-store" });
        const d = await r.json();
        if (!ativo) return;
        if (r.ok) {
          setMensagens(d.mensagens ?? []);
        } else {
          setErro(d?.erro ?? "Não foi possível abrir a conversa.");
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
  }, [conversa.id]);

  // Cursor do delta: horário da última mensagem já confirmada pelo servidor
  // (ignora bolhas otimistas, cujo horário é do cliente).
  const ultimaMsgRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const reais = mensagens.filter((m) => !m.id.startsWith("tmp:"));
    ultimaMsgRef.current = reais[reais.length - 1]?.enviadaEm;
  }, [mensagens]);

  // Busca incremental: só o que chegou depois do cursor.
  const buscarDelta = useCallback(async () => {
    const ultima = ultimaMsgRef.current;
    const url = `/api/whatsapp/conversas/${conversa.id}/mensagens${ultima ? `?depois=${encodeURIComponent(ultima)}` : ""}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { mensagens: MensagemItem[] };
      if (d.mensagens?.length) {
        setMensagens((antigas) => {
          const vistos = new Set(antigas.map((m) => m.id));
          return [...antigas, ...d.mensagens.filter((m) => !vistos.has(m.id))];
        });
      }
    } catch {
      /* rede instável: o SSE reconecta e o fallback cobre */
    }
  }, [conversa.id]);

  // Tempo real: ao chegar aviso desta conversa, busca o delta na hora. Um
  // polling lento fica de rede de segurança caso o stream caia.
  useEffect(() => {
    const desassinar = assinarMensagens((e) => {
      if (!e.conversaId || e.conversaId === conversa.id) void buscarDelta();
    });
    const t = setInterval(() => void buscarDelta(), FALLBACK_THREAD_MS);
    return () => {
      desassinar();
      clearInterval(t);
    };
  }, [conversa.id, buscarDelta]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);

  /** Quem escreveu a mensagem, do jeito que a citação a apresenta. */
  function autorDe(m: MensagemItem): string | null {
    if (m.direcao === "OUT") return m.autorNome ?? "Você";
    return m.remetente ?? conversa.nome;
  }

  /** Citar põe a mensagem em cima da caixa e devolve o cursor para quem escreve. */
  function citar(m: MensagemItem) {
    setCitando(m);
    caixa.current?.focus();
  }

  /** Toque na citação leva até a mensagem original, e a deixa acesa um instante. */
  function irPara(id: string) {
    const alvo = document.getElementById(`msg-${id}`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    setDestacada(id);
    setTimeout(() => setDestacada((a) => (a === id ? null : a)), DESTAQUE_MS);
  }

  /** A citação como ela vai ficar guardada — para a bolha otimista não mentir. */
  function citacaoOtimista(): CitacaoItem | null {
    if (!citando) return null;
    return { id: citando.id, texto: citando.texto, autor: autorDe(citando) };
  }

  async function responder() {
    const conteudo = texto.trim();
    if (!temConteudo) return;
    setErro("");
    const citada = citacaoOtimista();
    const citarId = citando?.id;
    // Libera o campo na hora, pronto para a próxima resposta.
    setTexto("");
    setCitando(null);

    // Bolha otimista: a mensagem aparece na conversa imediatamente; o servidor
    // confirma em segundo plano. Só marca falha se o envio não completar. A
    // assinatura entra aqui porque é ela que o servidor vai colar no envio.
    const tempId = `tmp:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const otimista: MensagemItem = {
      id: tempId,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorNome: null,
      remetente: null,
      texto: conteudo.startsWith(prefixo.trimEnd()) ? conteudo : prefixo + conteudo,
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      erro: null,
      citavel: false, // ainda não existe no WhatsApp: citar não teria a quem apontar
      citada,
    };
    setMensagens((antigas) => [...antigas, otimista]);

    try {
      const r = await fetch(`/api/whatsapp/conversas/${conversa.id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo, ...(citarId ? { citarId } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // Verdade do servidor substitui a bolha otimista, preservando outras
        // ainda em voo (envios rápidos em sequência).
        setMensagens((antigas) => {
          const pendentes = antigas.filter((m) => m.id.startsWith("tmp:") && m.id !== tempId);
          return [...(d.mensagens ?? []), ...pendentes];
        });
      } else {
        setMensagens((antigas) =>
          antigas.map((m) => (m.id === tempId ? { ...m, erro: d?.erro ?? "não enviada" } : m)),
        );
        setErro(d?.erro ?? "Não foi possível enviar.");
      }
    } catch {
      setMensagens((antigas) =>
        antigas.map((m) => (m.id === tempId ? { ...m, erro: "falha de conexão" } : m)),
      );
      setErro("Falha de conexão.");
    }
  }

  /**
   * Sobe o binário e troca a conversa pela versão do servidor. Serve ao anexo
   * (imagem/PDF, com o texto digitado de legenda) e ao áudio gravado — que vai
   * sem legenda, porque mensagem de voz do WhatsApp não tem onde mostrá-la.
   */
  async function enviarBinario(arquivo: File, { comLegenda }: { comLegenda: boolean }) {
    if (anexando) return;
    setAnexando(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      if (comLegenda && temConteudo) form.append("texto", texto.trim());
      // A citação vale para o que sair em seguida — inclusive anexo e áudio.
      if (citando) form.append("citarId", citando.id);
      const r = await fetch(`/api/whatsapp/conversas/${conversa.id}/mensagens`, {
        method: "POST",
        body: form,
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMensagens(d.mensagens ?? []);
        setCitando(null);
        // O texto só se apaga quando foi junto: áudio não leva a caixa embora.
        if (comLegenda) setTexto("");
      } else {
        setErro(d?.erro ?? "Não foi possível enviar.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setAnexando(false);
    }
  }

  async function enviarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!arquivo) return;
    await enviarBinario(arquivo, { comLegenda: true });
  }

  async function limpar() {
    setConfirmando(null);
    const r = await fetch(`/api/whatsapp/conversas/${conversa.id}/mensagens`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d?.erro ?? "Não foi possível limpar a conversa.");
      return;
    }
    setMensagens([]);
  }

  async function remover() {
    setConfirmando(null);
    const r = await fetch(`/api/whatsapp/conversas/${conversa.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d?.erro ?? "Não foi possível remover a conversa.");
      return;
    }
    onConversaRemovida(conversa.id);
  }

  /** Um toque na bandeira classifica e move o lead no funil na hora. */
  async function classificar(interesse: ConversaInteresse) {
    if (classificando || interesse === conversa.interesse) return;
    setClassificando(true);
    setErro("");
    try {
      const r = await fetch(`/api/whatsapp/conversas/${conversa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interesse }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(d?.erro ?? "Não foi possível classificar.");
        return;
      }
      onConversaAtualizada(d.conversa);
      // A classificação move o lead no funil; sem isso a Captação continuaria
      // servindo o RSC em cache com o estágio antigo.
      router.refresh();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setClassificando(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barra fina no topo: as flags de classificação (não existem em grupo),
          "Respostas prontas" abre o acervo comum e, para ADMIN, as ações
          destrutivas à direita. Nome e contato saem no "ver" da lista —
          cabeçalho maior seria só peso. */}
      {(podeApagar || podeResponder || !conversa.ehGrupo) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1.5">
          <div className="flex items-center gap-4">
            {!conversa.ehGrupo && (
              // Todo lead entra "Lead novo"; um toque numa bandeira reclassifica.
              // A ativa fica acesa; as outras, apagadas até o hover.
              <div className="flex items-center gap-0.5" role="group" aria-label="Classificar lead">
                {FLAGS.map((f) => {
                  const ativa = conversa.interesse === f.interesse;
                  return (
                    <button
                      key={f.interesse}
                      onClick={() => void classificar(f.interesse)}
                      disabled={classificando}
                      title={INTERESSE_LABEL[f.interesse]}
                      aria-label={`Classificar como ${INTERESSE_LABEL[f.interesse]}`}
                      aria-pressed={ativa}
                      className={cn(
                        "rounded-md p-1 transition-all",
                        ativa
                          ? "bg-surface-2 ring-1 ring-border-strong"
                          : "opacity-35 hover:opacity-90",
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
                onClick={() => {
                  setMostrandoRespostas((a) => !a);
                  setMostrandoAula(false);
                  setClassificando(false);
                }}
                aria-expanded={mostrandoRespostas}
                className="flex items-center gap-1.5 text-[11px] font-medium text-faint transition-colors hover:text-ink"
              >
                Respostas prontas
                <span
                  aria-hidden
                  className={cn(
                    "text-[9px] transition-transform",
                    mostrandoRespostas && "rotate-180",
                  )}
                >
                  ▼
                </span>
              </button>
            )}
          </div>
          {podeApagar && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmando("limpar")}
                className="text-[11px] font-medium text-faint transition-colors hover:text-ink"
              >
                Limpar
              </button>
              <button
                onClick={() => setConfirmando("remover")}
                className="text-[11px] font-medium text-faint transition-colors hover:text-red-bright"
              >
                Remover
              </button>
            </div>
          )}
        </div>
      )}

      {confirmando && (
        <ConfirmarExclusao
          tipo={confirmando}
          nome={conversa.nome}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={confirmando === "limpar" ? limpar : remover}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {carregando ? (
          <p className="py-10 text-center text-sm text-faint">Carregando conversa…</p>
        ) : mensagens.length === 0 ? (
          <p className="py-10 text-center text-sm text-faint">Nenhuma mensagem ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mensagens.map((m) => (
              <Bolha
                key={m.id}
                mensagem={m}
                destacada={destacada === m.id}
                onCitar={podeResponder ? () => citar(m) : undefined}
                onIrPara={irPara}
              />
            ))}
          </div>
        )}
        <div ref={fim} />
      </div>

      {/* A resposta escolhida cai na caixa pronta para ajustar antes de enviar —
          escolher nunca envia sozinho. */}
      {podeResponder && (
        <RespostasProntas
          aberto={mostrandoRespostas}
          onEscolher={(t) => {
            setTexto(t);
            setMostrandoRespostas(false);
            caixa.current?.focus();
          }}
        />
      )}

      {/* Marcar aula experimental é conversa de grupo nenhuma: é um compromisso
          com uma pessoa. */}
      {podeResponder && !conversa.ehGrupo && (
        <>
          <AulaExperimentalPainel
            key={aberturasAula}
            aberto={mostrandoAula}
            conversaId={conversa.id}
            onAgendada={(_aula, msgs) => {
              setMensagens(msgs);
              setMostrandoAula(false);
            }}
          />
          <button
            onClick={() => {
              const abrindo = !mostrandoAula;
              setMostrandoAula(abrindo);
              if (abrindo) setAberturasAula((n) => n + 1);
              setMostrandoRespostas(false);
            }}
            aria-expanded={mostrandoAula}
            className="flex shrink-0 items-center gap-1.5 border-t border-border px-4 py-1.5 text-[11px] font-medium text-faint transition-colors hover:text-ink"
          >
            <span
              aria-hidden
              className={cn("text-[9px] transition-transform", mostrandoAula && "rotate-180")}
            >
              ▼
            </span>
            aula experimental
          </button>
        </>
      )}

      <div className="border-t border-border px-4 py-3">
        {podeResponder ? (
          <>
            {/* A mensagem citada fica espelhada em cima da caixa, como no
                WhatsApp: quem escreve vê o que está respondendo. */}
            {citando && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-border border-l-2 border-l-red-bright bg-surface-2 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-red-bright">
                    {autorDe(citando) ?? "Mensagem"}
                  </p>
                  <p className="truncate text-xs text-muted">{citando.texto}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCitando(null)}
                  aria-label="Cancelar citação"
                  className="-mr-1 shrink-0 rounded p-1 text-faint transition-colors hover:text-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
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
              {/* Gravando, a linha inteira é do gravador: anexo, caixa e enviar
                  sairiam sobrando, e no celular não caberiam ao lado do
                  contador. */}
              {!gravando && (
                <button
                  type="button"
                  onClick={() => inputArquivo.current?.click()}
                  disabled={anexando}
                  title="Anexar imagem ou PDF"
                  aria-label="Anexar imagem ou PDF"
                  className={cn(
                    "shrink-0 self-end rounded-lg border border-border p-2.5 text-muted transition-colors hover:text-ink",
                    anexando && "cursor-not-allowed opacity-50",
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
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
                // Escape solta a citação sem tirar a mão do teclado.
                onKeyUp={(e) => {
                  if (e.key === "Escape" && citando) setCitando(null);
                }}
                // O que o Enter faz é escolha de quem atende, guardada na conta:
                // uns escrevem em parágrafos e não querem disparar meia resposta,
                // outros vêm do WhatsApp Web e esperam Enter enviando. As regras
                // (e o atalho que sobra para o outro uso) moram em `atalho-envio`.
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
                  // Segura a quebra de linha mesmo com a caixa vazia ou com anexo
                  // em voo: senão o Enter que não enviou deixaria uma linha solta.
                  e.preventDefault();
                  if (!anexando && temConteudo) void responder();
                }}
                rows={3}
                placeholder={dicaComposer(enterEnvia)}
                className={cn(inputCls, "flex-1 resize-none")}
              />
              )}
              {!gravando && (
                <button
                  onClick={() => void responder()}
                  disabled={anexando || !temConteudo}
                  title="Enviar"
                  aria-label="Enviar"
                  className={cn(
                    "shrink-0 self-end rounded-lg p-2.5 transition-colors",
                    anexando || !temConteudo
                      ? "cursor-not-allowed bg-surface-2 text-faint"
                      : "bg-red text-white hover:bg-red-bright",
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 22-7z" />
                  </svg>
                </button>
              )}
            </div>
            {anexando && <p className="mt-2 text-xs text-faint">Enviando…</p>}
            {erro && <p className="mt-2 text-xs text-red-bright">{erro}</p>}
          </>
        ) : (
          <p className="text-center text-xs text-faint">
            Seu perfil pode ler o histórico, mas não responder.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmação de ação destrutiva. Deixa explícito o que sobrevive a cada uma —
 * "limpar" e "remover" soam parecidos e têm consequências bem diferentes.
 */
function ConfirmarExclusao({
  tipo,
  nome,
  onCancelar,
  onConfirmar,
}: {
  tipo: "limpar" | "remover";
  nome: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const limpando = tipo === "limpar";
  return (
    <Modal onFechar={onCancelar}>
      <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
        {limpando ? "Limpar conversa" : "Remover conversa"}
      </h3>
      <p className="mt-2 text-sm text-muted">
        {limpando ? (
          <>
            Apaga as mensagens de <strong className="text-ink">{nome}</strong>. A conversa continua
            na lista, com o lead e o histórico de atendimento intactos.
          </>
        ) : (
          <>
            Remove a conversa de <strong className="text-ink">{nome}</strong> com as mensagens e os
            registros de atendimento. O cadastro do lead <strong className="text-ink">não</strong> é
            apagado e continua no funil.
          </>
        )}
      </p>
      <p className="mt-2 text-xs text-faint">
        {limpando
          ? "Não dá para desfazer por aqui — fica uma cópia no backup do sistema."
          : "Não dá para desfazer por aqui — fica uma cópia no backup do sistema. Se a pessoa escrever de novo, uma conversa nova aparece."}
      </p>
      <div className="mt-5 flex gap-3">
        <button
          onClick={onConfirmar}
          className="flex-1 rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
        >
          {limpando ? "Limpar" : "Remover"}
        </button>
        <button
          onClick={onCancelar}
          className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

const ROTULOS = new Set(Object.values(ROTULO_MIDIA));

/**
 * Mídia buscada sob demanda: o Coliseu não guarda foto nem áudio de conversa,
 * pede à Evolution na hora de exibir. Imagem carrega quando entra na tela
 * (`lazy`); áudio e vídeo só ao dar play (`preload="none"`) — abrir uma conversa
 * cheia de mídia não vira uma enxurrada de download.
 *
 * Mídia antiga expira no WhatsApp; quando o download falha, a bolha volta a ser
 * o rótulo, em vez de um ícone quebrado.
 */
function Midia({ mensagem }: { mensagem: MensagemItem }) {
  const [falhou, setFalhou] = useState(false);
  const url = `/api/whatsapp/mensagens/${mensagem.id}/midia`;

  if (falhou) {
    return (
      <p className="text-xs text-faint">
        {mensagem.texto} · não foi possível carregar; veja pelo aparelho
      </p>
    );
  }

  if (mensagem.tipoMidia === "imagem") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* Binário servido pela nossa API; otimização do Next não se aplica. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={mensagem.texto}
          loading="lazy"
          onError={() => setFalhou(true)}
          className="max-h-64 rounded-lg"
        />
      </a>
    );
  }

  if (mensagem.tipoMidia === "audio") {
    return (
      <audio controls preload="none" src={url} onError={() => setFalhou(true)} className="w-60 max-w-full" />
    );
  }

  if (mensagem.tipoMidia === "video") {
    return (
      <video
        controls
        preload="none"
        src={url}
        onError={() => setFalhou(true)}
        className="max-h-64 rounded-lg"
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-red-bright hover:underline"
    >
      📎 Abrir documento
    </a>
  );
}

/**
 * O trecho citado dentro da bolha — a barrinha vermelha com o pedaço da
 * mensagem respondida. Vira botão quando a original ainda está na conversa;
 * citação de mensagem já apagada continua legível, só não leva a lugar nenhum.
 */
function TrechoCitado({
  citacao,
  onIrPara,
}: {
  citacao: CitacaoItem;
  onIrPara?: (id: string) => void;
}) {
  const cls =
    "mb-1.5 block w-full rounded-md border-l-2 border-red-bright bg-bg/50 px-2 py-1 text-left";
  const conteudo = (
    <>
      {citacao.autor && (
        <span className="block text-[11px] font-semibold text-red-bright">{citacao.autor}</span>
      )}
      <span className="line-clamp-2 break-words text-[11px] text-muted">
        {citacao.texto || "Mensagem"}
      </span>
    </>
  );

  const alvo = citacao.id;
  if (!alvo || !onIrPara) return <div className={cls}>{conteudo}</div>;
  return (
    <button
      type="button"
      onClick={() => onIrPara(alvo)}
      title="Ir para a mensagem citada"
      className={cn(cls, "transition-colors hover:bg-bg/80")}
    >
      {conteudo}
    </button>
  );
}

/** Arrastar do lado: onde começa a valer, o gatilho, e o quanto a bolha anda. */
const ARRASTO = { minimo: 8, gatilho: 48, teto: 72 };

function Bolha({
  mensagem,
  destacada,
  onCitar,
  onIrPara,
}: {
  mensagem: MensagemItem;
  /** Acesa por um instante depois de alguém pular até ela por uma citação. */
  destacada?: boolean;
  /** Ausente quando o perfil não responde — quem só lê não cita. */
  onCitar?: () => void;
  onIrPara?: (id: string) => void;
}) {
  const saida = mensagem.direcao === "OUT";
  const temMidia = mensagem.tipoMidia !== "texto" && !mensagem.erro;
  // Mídia com legenda mostra as duas coisas; sem legenda, o texto é só o
  // rótulo que a mídia já substitui.
  const legenda = temMidia && ROTULOS.has(mensagem.texto) ? "" : mensagem.texto;
  const podeCitar = !!onCitar && mensagem.citavel;

  // Arrastar para o lado para responder, como no celular. O toque só vira
  // arrasto quando anda mais na horizontal que na vertical — senão roubaria a
  // rolagem da conversa, que é o gesto de longe mais usado aqui.
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
      // Rolagem vertical vence: o dedo desceu mais do que andou de lado.
      if (Math.abs(dx) <= Math.abs(dy)) {
        inicio.current = null;
        return;
      }
      horizontal.current = true;
      setArrastando(true);
    }
    // Só para a direita, como o WhatsApp: puxar para o outro lado não faz nada.
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
    <div
      id={`msg-${mensagem.id}`}
      className={cn("group relative flex", saida ? "justify-end" : "justify-start")}
    >
      {/* A seta aparece atrás da bolha conforme o dedo puxa — é o retorno de
          que soltar agora vai citar. */}
      {arrasto > 0 && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 -translate-y-1/2 text-red-bright"
          style={{ opacity: Math.min(1, arrasto / ARRASTO.gatilho) }}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
          // Deixa a rolagem vertical com o navegador; o lado é nosso.
          touchAction: podeCitar ? "pan-y" : undefined,
        }}
        className={cn(
          "relative max-w-[80%] rounded-xl border px-3.5 py-2",
          saida ? "border-red/30 bg-red-ghost" : "border-border bg-surface-2",
          mensagem.erro && "border-red/70",
          destacada && "ring-2 ring-red-bright",
        )}
      >
        {/* No desktop não há arrasto: o botão aparece ao passar o mouse. */}
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
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 17l-6-6 6-6" />
              <path d="M3 11h10a8 8 0 0 1 8 8v2" />
            </svg>
          </button>
        )}
        {mensagem.citada && <TrechoCitado citacao={mensagem.citada} onIrPara={onIrPara} />}
        {/* Em grupo, quem falou importa tanto quanto o que foi dito. */}
        {!saida && mensagem.remetente && (
          <p className="mb-0.5 text-[11px] font-semibold text-red-bright">{mensagem.remetente}</p>
        )}
        {temMidia && (
          <div className={cn(legenda && "mb-1.5")}>
            <Midia mensagem={mensagem} />
          </div>
        )}
        {legenda && <p className="whitespace-pre-wrap break-words text-sm text-ink">{legenda}</p>}
        <p className="mt-1 text-right text-[11px] text-faint">
          {saida && (mensagem.autorNome ?? "pelo aparelho")}
          {saida && " · "}
          {hora(mensagem.enviadaEm)}
          {mensagem.erro && <span className="text-red-bright"> · não entregue</span>}
        </p>
      </div>
    </div>
  );
}

