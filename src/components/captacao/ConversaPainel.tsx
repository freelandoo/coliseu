"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Bandeira } from "@/components/ui/Bandeira";
import { RespostasProntas } from "@/components/captacao/RespostasProntas";
import { AulaExperimentalPainel } from "@/components/captacao/AulaExperimentalPainel";
import { assinarMensagens } from "@/lib/whatsapp/stream-cliente";
import { deveEnviarNoEnter, dicaComposer } from "@/lib/whatsapp/atalho-envio";
import { cn } from "@/lib/cn";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";
import {
  INTERESSE_LABEL,
  type ConversaInteresse,
  type ConversaResumo,
  type LeadEstagio,
  type MensagemItem,
} from "@/lib/types";

/** Rede de segurança: o SSE traz em tempo real; isto cobre um stream caído. */
const FALLBACK_THREAD_MS = 60_000;

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
  /** Login de quem atende — o primeiro nome vira o "alex: " no começo de cada resposta. */
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
  // Assinatura no corpo da mensagem: quem recebe no WhatsApp vê quem atendeu.
  // Só o primeiro nome do login, escrito como nome de gente — "alex.rodriguus"
  // vira "Alex". A caixa alta do começo não é enfeite: é o que faz a mensagem
  // parecer assinada por uma pessoa, e não um login de sistema vazando para o
  // cliente. Focar a caixa vazia já deixa "Alex: " pronto, com o cursor na
  // frente; sair sem escrever nada limpa, para o placeholder voltar.
  //
  // Os asteriscos são a marcação de negrito do WhatsApp: na caixa aparecem
  // crus, mas quem recebe lê "Alex:" destacado do resto da mensagem. Negrito de
  // verdade aqui dentro exigiria trocar o textarea por um contenteditable — e
  // não é aqui que o destaque faz falta, é no celular do cliente.
  const primeiroNome = assinatura.split(".")[0] || assinatura;
  const nomeExibido = `${primeiroNome.charAt(0).toUpperCase()}${primeiroNome.slice(1).toLowerCase()}`;
  const prefixo = `*${nomeExibido}:* `;

  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  // Texto que veio pronto da Captação já entra assinado, como se tivesse sido
  // escolhido nas respostas prontas.
  const [texto, setTexto] = useState(textoInicial ? prefixo + textoInicial : "");
  const [anexando, setAnexando] = useState(false);
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
  const fim = useRef<HTMLDivElement>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const semAssinatura = texto.startsWith(prefixo) ? texto.slice(prefixo.length) : texto;
  const temConteudo = semAssinatura.trim().length > 0;

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

  async function responder() {
    const conteudo = texto.trim();
    if (!temConteudo) return;
    setErro("");
    // Libera o campo na hora, já com a assinatura pronta para a próxima resposta.
    setTexto(prefixo);

    // Bolha otimista: a mensagem aparece na conversa imediatamente; o servidor
    // confirma em segundo plano. Só marca falha se o envio não completar.
    const tempId = `tmp:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const otimista: MensagemItem = {
      id: tempId,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorNome: null,
      remetente: null,
      texto: conteudo,
      tipoMidia: "texto",
      enviadaEm: new Date().toISOString(),
      erro: null,
    };
    setMensagens((antigas) => [...antigas, otimista]);

    try {
      const r = await fetch(`/api/whatsapp/conversas/${conversa.id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo }),
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

  /** Anexa imagem ou PDF: manda direto ao escolher, com o texto digitado de legenda. */
  async function enviarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!arquivo || anexando) return;
    setAnexando(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      // Só assinatura não é legenda — o anexo vai limpo.
      if (temConteudo) form.append("texto", texto.trim());
      const r = await fetch(`/api/whatsapp/conversas/${conversa.id}/mensagens`, {
        method: "POST",
        body: form,
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMensagens(d.mensagens ?? []);
        setTexto("");
      } else {
        setErro(d?.erro ?? "Não foi possível enviar o anexo.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setAnexando(false);
    }
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
              <Bolha key={m.id} mensagem={m} />
            ))}
          </div>
        )}
        <div ref={fim} />
      </div>

      {/* A resposta escolhida cai na caixa já assinada, pronta para ajustar
          antes de enviar — escolher nunca envia sozinho. */}
      {podeResponder && (
        <RespostasProntas
          aberto={mostrandoRespostas}
          onEscolher={(t) => {
            setTexto(prefixo + t);
            setMostrandoRespostas(false);
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
            <div className="flex items-end gap-2">
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => void enviarArquivo(e)}
                className="hidden"
              />
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
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onFocus={() => {
                  if (texto === "") setTexto(prefixo);
                }}
                onBlur={() => {
                  if (!temConteudo) setTexto("");
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
            </div>
            {anexando && <p className="mt-2 text-xs text-faint">Enviando anexo…</p>}
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

function Bolha({ mensagem }: { mensagem: MensagemItem }) {
  const saida = mensagem.direcao === "OUT";
  const temMidia = mensagem.tipoMidia !== "texto" && !mensagem.erro;
  // Mídia com legenda mostra as duas coisas; sem legenda, o texto é só o
  // rótulo que a mídia já substitui.
  const legenda = temMidia && ROTULOS.has(mensagem.texto) ? "" : mensagem.texto;

  return (
    <div className={cn("flex", saida ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl border px-3.5 py-2",
          saida ? "border-red/30 bg-red-ghost" : "border-border bg-surface-2",
          mensagem.erro && "border-red/70",
        )}
      >
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

