"use client";
import { useEffect, useRef, useState } from "react";
import { EVENTO_LIBERACAO } from "@/components/acesso/HistoricoLiberacoes";

type Estado = "idle" | "enviando" | "aguardando" | "liberada" | "erro";

/**
 * Libera um giro sem cadastro (visitante, aluno sem face, catraca travada).
 * Acompanha o comando até o agente confirmar; se ele não executar em ~30s, o
 * servidor expira o comando e a tela avisa — a catraca nunca abre depois.
 */
export function LiberarCatraca({ deviceId, online }: { deviceId: string; online: boolean }) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [erro, setErro] = useState("");
  const [motivo, setMotivo] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function acompanhar(cmd: string, inicio: number) {
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/acesso/device/${deviceId}/liberar?cmd=${cmd}`, { cache: "no-store" });
        const d = (await r.json()) as { status?: string; lastError?: string };
        if (d.status === "SUCCEEDED") {
          window.dispatchEvent(new Event(EVENTO_LIBERACAO));
          setEstado("liberada");
          setMotivo("");
          timer.current = setTimeout(() => setEstado("idle"), 4000);
          return;
        }
        if (d.status === "FAILED" || d.status === "DEAD_LETTER") {
          setEstado("erro");
          setErro(d.lastError?.startsWith("expirado") ? "O agente não respondeu a tempo — a catraca não foi liberada." : (d.lastError ?? "Falhou"));
          return;
        }
      } catch {
        /* sem rede: tenta de novo */
      }
      if (Date.now() - inicio > 45_000) {
        setEstado("erro");
        setErro("Sem confirmação do agente — confira a catraca.");
        return;
      }
      acompanhar(cmd, inicio);
    }, 1500);
  }

  async function liberar() {
    setErro("");
    setEstado("enviando");
    try {
      const r = await fetch(`/api/acesso/device/${deviceId}/liberar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const d = (await r.json().catch(() => ({}))) as { comandoId?: string; erro?: string };
      if (!r.ok || !d.comandoId) {
        setEstado("erro");
        setErro(d.erro ?? "Falha ao liberar");
        return;
      }
      setEstado("aguardando");
      window.dispatchEvent(new Event(EVENTO_LIBERACAO));
      acompanhar(d.comandoId, Date.now());
    } catch {
      setEstado("erro");
      setErro("Sem conexão com o servidor");
    }
  }

  const ocupado = estado === "enviando" || estado === "aguardando";
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional): visitante, sem face…"
          maxLength={120}
          disabled={!online || ocupado}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-red/60 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={liberar}
          disabled={!online || ocupado}
          className={
            "shrink-0 rounded-lg px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-white transition-colors disabled:opacity-60 " +
            (estado === "liberada" ? "bg-ok" : "bg-red hover:bg-red-bright")
          }
        >
          {estado === "enviando" ? "Enviando…" : estado === "aguardando" ? "Liberando…" : estado === "liberada" ? "Liberada ✓" : "Liberar catraca"}
        </button>
      </div>
      {!online && <p className="text-[11px] text-faint">Catraca offline — liberação indisponível.</p>}
      {estado === "erro" && <p className="text-xs text-red-bright">{erro}</p>}
    </div>
  );
}
