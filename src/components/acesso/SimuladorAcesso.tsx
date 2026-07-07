"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface AlunoOpcao {
  id: string;
  nome: string;
  status: string | null;
}

interface Resultado {
  nome: string;
  allow: boolean;
  status: string;
  reason: string;
  physicallyPassed: boolean;
  deviceName: string | null;
  consumiuCortesia: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ativo",
  PENDING_PAYMENT: "aguardando pgto",
  SUSPENDED: "suspenso",
  CANCELED: "cancelado",
  EXPIRED: "expirado",
  DRAFT: "rascunho",
};

export function SimuladorAcesso({ alunos }: { alunos: AlunoOpcao[] }) {
  const router = useRouter();
  const [personId, setPersonId] = useState(alunos[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function verificar() {
    if (!personId) return;
    setErro("");
    setResultado(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/acesso/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(d?.erro ?? "Falha ao simular acesso");
        return;
      }
      setResultado(d as Resultado);
      router.refresh(); // atualiza "Acessos recentes"
    } catch {
      setErro("Sem conexão com o servidor");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
        Simulador de acesso · teste
      </h2>
      <Card className="p-5">
        <p className="mb-4 text-sm text-muted">
          Reconhece a face de um aluno e passa pela política real de acesso — a catraca{" "}
          <span className="text-ok">libera</span> se estiver em dia,{" "}
          <span className="text-red-bright">bloqueia</span> se inativo/inadimplente. O giro é
          registrado em “Acessos recentes”.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-faint">Aluno</span>
            <select
              value={personId}
              onChange={(e) => { setPersonId(e.target.value); setResultado(null); setErro(""); }}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
            >
              {alunos.length === 0 && <option value="">Nenhum aluno</option>}
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.status ? ` — ${STATUS_LABEL[a.status] ?? a.status.toLowerCase()}` : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={verificar}
            disabled={enviando || !personId}
            className="rounded-lg bg-red px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60"
          >
            {enviando ? "Verificando…" : "Verificar face"}
          </button>
        </div>

        {erro && <p className="mt-4 text-xs text-red-bright">{erro}</p>}

        {resultado && (
          <div
            className={cn(
              "mt-5 rounded-lg border p-5",
              resultado.allow ? "border-ok/40 bg-ok/10" : "border-red/40 bg-red-ghost",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
                  {resultado.allow ? "Catraca liberou ✓" : "Bloqueado"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {resultado.nome}
                  {resultado.deviceName ? ` · ${resultado.deviceName}` : ""}
                </p>
              </div>
              <Badge tone={resultado.allow ? "ok" : "red"}>{resultado.allow ? "ALLOWED" : "DENIED"}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Badge tone="neutral">motivo: {resultado.reason}</Badge>
              <Badge tone="neutral">status: {resultado.status}</Badge>
              <Badge tone={resultado.physicallyPassed ? "ok" : "neutral"}>
                giro: {resultado.physicallyPassed ? "sim" : "não"}
              </Badge>
              {resultado.consumiuCortesia && <Badge tone="warn">cortesia consumida</Badge>}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
