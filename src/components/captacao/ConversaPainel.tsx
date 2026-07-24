"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";
import {
  INTERESSE_LABEL,
  type AtendimentoItem,
  type ConversaInteresse,
  type ConversaResumo,
  type MensagemItem,
} from "@/lib/types";

const POLL_THREAD_MS = 3_000;

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/** Variante compacta (fonte pequena) usada na barra de classificação. */
const campoCls =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Histórico da conversa + resposta manual + classificação do atendimento. */
export function ConversaPainel({
  conversa,
  podeResponder,
  podeApagar,
  onConversaAtualizada,
  onConversaRemovida,
}: {
  conversa: ConversaResumo;
  podeResponder: boolean;
  /** Limpar/remover apagam trilha de atendimento — só ADMIN. */
  podeApagar: boolean;
  onConversaAtualizada: (c: ConversaResumo) => void;
  onConversaRemovida: (id: string) => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoItem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState<"limpar" | "remover" | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
          setAtendimentos(d.atendimentos ?? []);
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

  // Polling incremental: pede só o que chegou depois da última mensagem.
  useEffect(() => {
    const t = setInterval(async () => {
      const ultima = mensagens[mensagens.length - 1]?.enviadaEm;
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
        /* rede instável: próxima volta resolve */
      }
    }, POLL_THREAD_MS);
    return () => clearInterval(t);
  }, [conversa.id, mensagens]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);

  async function responder() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch(`/api/whatsapp/conversas/${conversa.id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMensagens(d.mensagens ?? []);
        setTexto("");
      } else {
        setErro(d?.erro ?? "Não foi possível enviar.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
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

  async function classificar(interesse: ConversaInteresse, observacao: string, motivo: string) {
    const r = await fetch(`/api/whatsapp/conversas/${conversa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interesse, observacao, motivoPerdido: motivo }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d?.erro ?? "Não foi possível salvar a classificação.");
      return false;
    }
    setAtendimentos(d.atendimentos ?? []);
    onConversaAtualizada(d.conversa);
    // A classificação move o lead no funil; sem isso a aba Leads continuaria
    // servindo o RSC em cache com o estágio antigo.
    router.refresh();
    return true;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Sem cabeçalho: nome e contato saem no "ver" da lista à esquerda.
          Só sobra a barra fina de ações destrutivas, para ADMIN. */}
      {podeApagar && (
        <div className="flex shrink-0 items-center justify-end gap-3 border-b border-border px-4 py-1.5">
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

      {/* Grupo não é lead: classificar interesse ali não moveria funil nenhum. */}
      {!conversa.ehGrupo && (
        <ClassificarAtendimento
          atual={conversa.interesse}
          atendimentos={atendimentos}
          onSalvar={classificar}
        />
      )}

      <div className="border-t border-border px-4 py-3">
        {podeResponder ? (
          <>
            <div className="flex gap-3">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void responder();
                  }
                }}
                rows={2}
                placeholder="Escreva a resposta… (Enter envia, Shift+Enter quebra linha)"
                className={cn(inputCls, "resize-none")}
              />
              <button
                onClick={() => void responder()}
                disabled={enviando || !texto.trim()}
                className={cn(
                  "shrink-0 self-end rounded-lg px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
                  enviando || !texto.trim()
                    ? "cursor-not-allowed bg-surface-2 text-faint"
                    : "bg-red text-white hover:bg-red-bright",
                )}
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </div>
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
          ? "Não dá para desfazer."
          : "Não dá para desfazer. Se a pessoa escrever de novo, uma conversa nova aparece."}
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

const OPCOES = Object.entries(INTERESSE_LABEL) as [ConversaInteresse, string][];

/** Cadastro de atendimento: quem atendeu, o que classificou e por quê. */
function ClassificarAtendimento({
  atual,
  atendimentos,
  onSalvar,
}: {
  atual: ConversaInteresse;
  atendimentos: AtendimentoItem[];
  onSalvar: (i: ConversaInteresse, obs: string, motivo: string) => Promise<boolean>;
}) {
  const [interesse, setInteresse] = useState<ConversaInteresse>(atual);
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  // Gaveta fechada por padrão: em cima da caixa de texto fica só a observação.
  const [aberto, setAberto] = useState(false);

  async function salvar() {
    setSalvando(true);
    setOk(false);
    const sucesso = await onSalvar(interesse, observacao, motivo);
    setSalvando(false);
    if (sucesso) {
      setObservacao("");
      setMotivo("");
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    }
  }

  const ultimo = atendimentos[0];

  return (
    <div className="border-t border-border bg-surface-2/40 text-xs">
      {/* Gaveta retrátil: Interesse, Motivo e o último registro. Fechada, some;
          aberta, empurra pra cima acima da linha do Registrar. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 px-4 pt-3">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted">Interesse</label>
              <select
                value={interesse}
                onChange={(e) => setInteresse(e.target.value as ConversaInteresse)}
                className={campoCls}
              >
                {OPCOES.map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {interesse === "perdido" && (
              <div className="min-w-[160px] flex-1">
                <label className="mb-1 block text-xs font-medium text-muted">Motivo</label>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Preço, distância, foi pra outra academia…"
                  className={campoCls}
                />
              </div>
            )}
          </div>

          {ultimo && (
            <p className="px-4 pt-2 text-xs text-faint">
              Último registro: {INTERESSE_LABEL[ultimo.interesse]} por {ultimo.usuario} em{" "}
              {new Date(ultimo.criadoEm).toLocaleString("pt-BR")}
              {ultimo.observacao && ` — ${ultimo.observacao}`}
            </p>
          )}
        </div>
      </div>

      {/* Linha do Registrar (sempre visível): clicar nela abre/fecha a gaveta.
          A observação e o botão têm clique próprio e não disparam a gaveta. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAberto((a) => !a);
          }
        }}
        className="flex cursor-pointer flex-wrap items-end gap-3 px-4 py-2.5"
      >
        <div className="min-w-[200px] flex-1" onClick={(e) => e.stopPropagation()}>
          <label className="mb-1 block text-xs font-medium text-muted">Observação</label>
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="O que ficou combinado"
            className={campoCls}
          />
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            void salvar();
          }}
          disabled={salvando}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
            salvando
              ? "cursor-not-allowed border-border text-faint"
              : "border-border-strong text-muted hover:text-ink",
          )}
        >
          {salvando ? "Salvando…" : ok ? "Registrado ✓" : "Registrar"}
        </button>

        <span
          aria-hidden
          className={cn("self-center text-[11px] text-faint transition-transform", aberto && "rotate-180")}
        >
          ▲
        </span>
      </div>
    </div>
  );
}
