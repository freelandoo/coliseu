"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { classeBotao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";

type Diagnostico = {
  liberado: boolean;
  motivo: string;
  checklist: { item: string; ok: boolean; detalhe: string }[];
  comandos: { type: string; status: string; lastError: string | null; createdAt: string; device: string }[];
};

const COMANDO: Record<string, string> = {
  UPSERT_USER: "Enviar cadastro",
  ENABLE: "Liberar acesso",
  DISABLE: "Bloquear acesso",
  ENROLL: "Cadastrar face",
  REMOVE_USER: "Remover do aparelho",
  OPEN: "Liberação manual",
};

/** "Por que não passa na catraca?" + botão que reenvia o aluno ao aparelho. */
export function CatracaDoAluno({ personId }: { personId: string }) {
  const [d, setD] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState("");
  const [corrigindo, setCorrigindo] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/pessoas/${personId}/catraca`, { cache: "no-store" });
      if (r.status === 403) return; // papel sem acesso à catraca: card some
      if (!r.ok) throw new Error();
      setD((await r.json()) as Diagnostico);
    } catch {
      setErro("Não foi possível carregar o diagnóstico da catraca.");
    }
  }, [personId]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function corrigir() {
    setCorrigindo(true);
    setAviso("");
    setErro("");
    try {
      const r = await fetch(`/api/pessoas/${personId}/catraca`, { method: "POST" });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { reenvios: number; diagnostico: Diagnostico };
      setD(j.diagnostico);
      setAviso("Enviado para a catraca. O agente da recepção aplica em alguns segundos — clique em Atualizar.");
    } catch {
      setErro("Falha ao corrigir.");
    } finally {
      setCorrigindo(false);
    }
  }

  if (!d) return erro ? <Card className="p-6 text-sm text-danger">{erro}</Card> : null;
  const semFace = !d.checklist.find((c) => c.item === "Face cadastrada")?.ok;

  return (
    <Card className="p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">Catraca</h2>
          <Badge tone={d.liberado ? "ok" : "danger"}>{d.liberado ? "Passa" : "Não passa"}</Badge>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            className={classeBotao({ variante: "secundario", tamanho: "sm" })}
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={corrigir}
            disabled={corrigindo}
            className={classeBotao({ variante: "primario", tamanho: "sm" })}
          >
            {corrigindo ? "Enviando…" : "Corrigir agora"}
          </button>
        </div>
      </div>

      <p className="text-sm text-ink">{d.motivo}</p>
      {aviso && <p className="mt-2 text-xs text-ok">{aviso}</p>}
      {erro && <MensagemErro className="mt-2">{erro}</MensagemErro>}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {d.checklist.map((c) => (
          <li key={c.item} className="rounded-lg border border-border px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <span aria-hidden className={c.ok ? "text-ok" : "text-danger"}>
                {c.ok ? "✓" : "✗"}
              </span>
              {c.item}
            </p>
            <p className="mt-0.5 text-xs text-faint">{c.detalhe}</p>
          </li>
        ))}
      </ul>

      {semFace && (
        <Link href="/acesso" className="mt-3 inline-block text-xs font-medium text-destaque hover:underline">
          Cadastrar a face na tela Acesso →
        </Link>
      )}

      {d.comandos.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-faint">Últimos comandos ao aparelho</p>
          <ul className="divide-y divide-border text-xs">
            {d.comandos.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="text-ink">
                  {COMANDO[c.type] ?? c.type}
                  <span className="ml-2 text-faint">
                    {c.device} ·{" "}
                    {new Date(c.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </span>
                <span
                  className={
                    c.status === "SUCCEEDED"
                      ? "text-ok"
                      : c.status === "FAILED" || c.status === "DEAD_LETTER"
                        ? "text-danger"
                        : "text-muted"
                  }
                >
                  {c.status}
                </span>
                {c.lastError && <span className="w-full text-danger">{c.lastError}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
