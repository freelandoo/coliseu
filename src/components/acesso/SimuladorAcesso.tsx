"use client";

import { useState } from "react";
import { MOTIVO_CURTO, rotulo } from "@/lib/access/rotulos";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { classeBotao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";

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
      <h2 className="mb-4 font-display text-sm font-semibold text-faint">
        Simulador de acesso · teste
      </h2>
      <Card className="p-5">
        <p className="mb-4 text-sm text-muted">
          Reconhece a face de um aluno e passa pela política real de acesso — a catraca{" "}
          <span className="text-ok">libera</span> se estiver em dia,{" "}
          <span className="text-danger">bloqueia</span> se inativo/inadimplente. O giro é
          registrado em “Acessos recentes”.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-xs font-semibold text-faint">Aluno</span>
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

          <button type="button"
            onClick={verificar}
            disabled={enviando || !personId}
            className={classeBotao({ variante: "primario" })}
          >
            {enviando ? "Verificando…" : "Verificar face"}
          </button>
        </div>

        {erro && <MensagemErro className="mt-4">{erro}</MensagemErro>}

        {resultado && (
          <div
            className={cn(
              "mt-5 rounded-lg border p-5",
              resultado.allow ? "border-ok/40 bg-ok/10" : "border-danger/ bg-danger-soft",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-semibold text-ink">
                  {resultado.allow ? "Catraca liberou ✓" : "Bloqueado"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {resultado.nome}
                  {resultado.deviceName ? ` · ${resultado.deviceName}` : ""}
                </p>
              </div>
              <Badge tone={resultado.allow ? "ok" : "danger"}>{resultado.allow ? "Liberado" : "Negado"}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Badge tone="neutral">motivo: {rotulo(MOTIVO_CURTO, resultado.reason)}</Badge>
              <Badge tone="neutral">matrícula: {STATUS_LABEL[resultado.status] ?? resultado.status}</Badge>
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
