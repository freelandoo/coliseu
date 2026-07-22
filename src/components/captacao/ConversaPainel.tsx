"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import {
  INTERESSE_LABEL,
  type AtendimentoItem,
  type ConversaInteresse,
  type ConversaResumo,
  type MensagemItem,
} from "@/lib/types";

const POLL_THREAD_MS = 3_000;

const TOM: Record<ConversaInteresse, "neutral" | "red" | "ok" | "warn"> = {
  nao_classificado: "neutral",
  com_interesse: "red",
  sem_interesse: "warn",
  perdido: "neutral",
  convertido: "ok",
};

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Histórico da conversa + resposta manual + classificação do atendimento. */
export function ConversaPainel({
  conversa,
  podeResponder,
  onConversaAtualizada,
}: {
  conversa: ConversaResumo;
  podeResponder: boolean;
  onConversaAtualizada: (c: ConversaResumo) => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemItem[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoItem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const fim = useRef<HTMLDivElement>(null);

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
    return true;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
            {conversa.nome}
          </p>
          <p className="text-xs text-faint">
            {conversa.telefone || "sem número"}
            {conversa.atendente && ` · atendido por ${conversa.atendente}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={TOM[conversa.interesse]}>{INTERESSE_LABEL[conversa.interesse]}</Badge>
          {conversa.personId && (
            <Link
              href={`/matriculados/${conversa.personId}`}
              className="text-xs font-medium text-red-bright hover:underline"
            >
              Ver cadastro →
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
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

      <ClassificarAtendimento
        atual={conversa.interesse}
        atendimentos={atendimentos}
        onSalvar={classificar}
      />

      <div className="border-t border-border px-5 py-4">
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

function Bolha({ mensagem }: { mensagem: MensagemItem }) {
  const saida = mensagem.direcao === "OUT";
  return (
    <div className={cn("flex", saida ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl border px-3.5 py-2",
          saida ? "border-red/30 bg-red-ghost" : "border-border bg-surface-2",
          mensagem.erro && "border-red/70",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm text-ink">{mensagem.texto}</p>
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
    <div className="border-t border-border bg-surface-2/40 px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-muted">Interesse</label>
          <select
            value={interesse}
            onChange={(e) => setInteresse(e.target.value as ConversaInteresse)}
            className={inputCls}
          >
            {OPCOES.map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {interesse === "perdido" && (
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Motivo</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Preço, distância, foi pra outra academia…"
              className={inputCls}
            />
          </div>
        )}

        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">Observação do atendimento</label>
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="O que ficou combinado"
            className={inputCls}
          />
        </div>

        <button
          onClick={() => void salvar()}
          disabled={salvando}
          className={cn(
            "rounded-lg border px-4 py-2 text-sm font-semibold uppercase tracking-widest transition-colors",
            salvando
              ? "cursor-not-allowed border-border text-faint"
              : "border-border-strong text-muted hover:text-ink",
          )}
        >
          {salvando ? "Salvando…" : ok ? "Registrado ✓" : "Registrar"}
        </button>
      </div>

      {ultimo && (
        <p className="mt-2 text-xs text-faint">
          Último registro: {INTERESSE_LABEL[ultimo.interesse]} por {ultimo.usuario} em{" "}
          {new Date(ultimo.criadoEm).toLocaleString("pt-BR")}
          {ultimo.observacao && ` — ${ultimo.observacao}`}
        </p>
      )}
    </div>
  );
}
