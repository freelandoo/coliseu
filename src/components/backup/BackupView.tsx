"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { INTERESSE_LABEL, type ConversaBackupItem, type MensagemItem } from "@/lib/types";

/** "2026-08-03" — o que o <input type="date"> espera. */
function paraInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ATALHOS: { rotulo: string; dias: number | null }[] = [
  { rotulo: "Hoje", dias: 0 },
  { rotulo: "7 dias", dias: 7 },
  { rotulo: "30 dias", dias: 30 },
  { rotulo: "Tudo", dias: null },
];

export function BackupView({ inicial }: { inicial: ConversaBackupItem[] }) {
  const [backups, setBackups] = useState(inicial);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<ConversaBackupItem | null>(null);
  const [espiando, setEspiando] = useState<ConversaBackupItem | null>(null);

  // Primeira carga já veio do servidor; daí em diante quem manda é o filtro.
  const primeiraCarga = useRef(true);
  useEffect(() => {
    if (primeiraCarga.current) {
      primeiraCarga.current = false;
      return;
    }
    let cancelado = false;
    setCarregando(true);
    const q = new URLSearchParams();
    if (de) q.set("de", de);
    if (ate) q.set("ate", ate);
    fetch(`/api/backup/conversas?${q}`)
      .then((r) => r.json())
      .then((d: { backups?: ConversaBackupItem[]; erro?: string }) => {
        if (cancelado) return;
        if (d.backups) setBackups(d.backups);
        else setErro(d.erro ?? "Não foi possível carregar o backup.");
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar o backup."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [de, ate]);

  function aplicarAtalho(dias: number | null) {
    if (dias === null) {
      setDe("");
      setAte("");
      return;
    }
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - dias);
    setDe(paraInput(inicio));
    setAte(paraInput(hoje));
  }

  async function restaurar(b: ConversaBackupItem) {
    setConfirmando(null);
    setErro(null);
    setAviso(null);
    const r = await fetch(`/api/backup/conversas/${b.id}/restaurar`, { method: "POST" });
    const d = (await r.json().catch(() => ({}))) as {
      erro?: string;
      mensagens?: number;
      ignoradas?: number;
    };
    if (!r.ok) {
      setErro(d.erro ?? "Não foi possível restaurar a conversa.");
      return;
    }
    setBackups((lista) =>
      lista.map((x) => (x.id === b.id ? { ...x, restauradoEm: new Date().toISOString() } : x)),
    );
    const ignoradas = d.ignoradas ? ` (${d.ignoradas} já estavam no atendimento)` : "";
    setAviso(`${b.nome}: ${d.mensagens ?? 0} mensagem(ns) restaurada(s)${ignoradas}.`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-widest text-faint">
          Excluídas de
          <input
            type="date"
            value={de}
            max={ate || undefined}
            onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm normal-case tracking-normal text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-widest text-faint">
          até
          <input
            type="date"
            value={ate}
            min={de || undefined}
            onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm normal-case tracking-normal text-ink"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {ATALHOS.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              onClick={() => aplicarAtalho(a.dias)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-faint">
          {carregando ? "Carregando…" : `${backups.length} conversa(s) guardada(s)`}
        </p>
      </Card>

      {erro && (
        <p className="rounded-lg border border-red/40 bg-red-ghost px-4 py-3 text-sm text-red-bright">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{aviso}</p>
      )}

      {backups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-faint">
          Nenhuma conversa excluída no período.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {backups.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {b.nome}
                  <Badge tone={b.motivo === "remover" ? "red" : "neutral"}>
                    {b.motivo === "remover" ? "Removida" : "Limpa"}
                  </Badge>
                  {b.restauradoEm && <Badge tone="ok">Restaurada</Badge>}
                </p>
                <p className="mt-0.5 truncate text-xs text-faint">
                  {b.telefone || (b.ehGrupo ? "Grupo" : "sem telefone")} · {b.mensagens} mensagem(ns)
                  {" · "}
                  {INTERESSE_LABEL[b.interesse]}
                </p>
                {b.preview && <p className="mt-1 truncate text-xs text-muted">{b.preview}</p>}
              </div>

              <div className="text-right text-[11px] text-faint">
                <p>{dataHora(b.excluidoEm)}</p>
                <p>por {b.excluidoPor}</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEspiando(b)}
                  className="text-[11px] font-medium text-faint transition-colors hover:text-ink"
                >
                  Ver
                </button>
                <button
                  type="button"
                  disabled={!!b.restauradoEm}
                  onClick={() => setConfirmando(b)}
                  className={cn(
                    "text-[11px] font-medium transition-colors",
                    b.restauradoEm
                      ? "cursor-not-allowed text-faint/50"
                      : "text-faint hover:text-ok",
                  )}
                >
                  Restaurar
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {espiando && <Espiar backup={espiando} onFechar={() => setEspiando(null)} />}

      {confirmando && (
        <Modal onFechar={() => setConfirmando(null)}>
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
            Restaurar conversa
          </h3>
          <p className="mt-2 text-sm text-muted">
            Devolve <strong className="text-ink">{confirmando.nome}</strong> ao atendimento com{" "}
            {confirmando.mensagens} mensagem(ns).
          </p>
          <p className="mt-2 text-xs text-faint">
            {confirmando.motivo === "remover"
              ? "Se a pessoa já escreveu de novo, o histórico entra na conversa que existe hoje. O registro de atendimento não volta."
              : "As mensagens voltam para a conversa que ficou na lista."}
          </p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => restaurar(confirmando)}
              className="flex-1 rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
            >
              Restaurar
            </button>
            <button
              onClick={() => setConfirmando(null)}
              className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Espia o histórico guardado antes de decidir restaurar. */
function Espiar({ backup, onFechar }: { backup: ConversaBackupItem; onFechar: () => void }) {
  const [mensagens, setMensagens] = useState<MensagemItem[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/backup/conversas/${backup.id}`)
      .then((r) => r.json())
      .then((d: { mensagens?: MensagemItem[] }) => {
        if (!cancelado) setMensagens(d.mensagens ?? []);
      })
      .catch(() => !cancelado && setMensagens([]));
    return () => {
      cancelado = true;
    };
  }, [backup.id]);

  return (
    <Modal onFechar={onFechar} className="max-w-lg">
      <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
        {backup.nome}
      </h3>
      <p className="mt-1 text-xs text-faint">
        {backup.motivo === "remover" ? "Removida" : "Limpa"} em {dataHora(backup.excluidoEm)} por{" "}
        {backup.excluidoPor}
      </p>

      <div className="mt-4 max-h-[50vh] overflow-y-auto">
        {mensagens === null ? (
          <p className="py-8 text-center text-sm text-faint">Carregando…</p>
        ) : mensagens.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">Sem mensagens guardadas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mensagens.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                  m.direcao === "IN"
                    ? "self-start border-border bg-surface-2 text-ink"
                    : "self-end border-red/40 bg-red-ghost text-ink",
                )}
              >
                {m.remetente && <p className="text-[10px] text-faint">{m.remetente}</p>}
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p className="mt-1 text-[10px] text-faint">{dataHora(m.enviadaEm)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onFechar}
        className="mt-5 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        Fechar
      </button>
    </Modal>
  );
}
