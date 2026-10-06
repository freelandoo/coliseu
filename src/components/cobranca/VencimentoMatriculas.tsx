"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { formatData } from "@/lib/mock-data";

type Candidato = {
  membershipId: string;
  personId: string;
  nome: string;
  codigo: string;
  plano: string;
  vencimentoPlano: string;
  diasVencido: number;
};
type Previa = { modo: "ativa" | "simular" | "desligada"; carenciaDias: number; candidatos: Candidato[] };

const MODO: Record<Previa["modo"], { rotulo: string; tom: "ok" | "warn" | "neutral"; texto: string }> = {
  ativa: {
    rotulo: "Automático ligado",
    tom: "ok",
    texto: "De hora em hora o sistema vence estas matrículas e bloqueia o acesso na catraca.",
  },
  simular: {
    rotulo: "Só simulação",
    tom: "warn",
    texto:
      "O sistema calcula mas não vence ninguém. Confira a lista; para ligar o automático, " +
      "defina EXPIRACAO_MATRICULAS=ativa no servidor.",
  },
  desligada: { rotulo: "Desligado", tom: "neutral", texto: "O vencimento automático está desligado." },
};

/**
 * Prévia do vencimento automático: quem passou do vencimento do plano além da
 * carência e não tem assinatura ativa no Asaas. O admin confere antes de
 * ligar o automático — vencer manda DISABLE para a catraca.
 */
export function VencimentoMatriculas() {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/matriculas/expiracao", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setPrevia((await r.json()) as Previa);
    } catch {
      setErro("Não foi possível carregar a prévia.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function vencerAgora() {
    if (!previa) return;
    if (
      !confirm(
        `Vencer ${previa.candidatos.length} matrícula(s) agora? O acesso desses alunos ` +
          "será bloqueado na catraca até renovarem.",
      )
    )
      return;
    setAplicando(true);
    setErro("");
    try {
      const r = await fetch("/api/matriculas/expiracao", { method: "POST" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { expiradas: number };
      setResultado(`${d.expiradas} matrícula(s) vencida(s).`);
      await carregar();
    } catch {
      setErro("Falha ao vencer as matrículas.");
    } finally {
      setAplicando(false);
    }
  }

  if (!previa) {
    return <Card className="p-6 text-sm text-faint">{erro || "Carregando…"}</Card>;
  }
  const modo = MODO[previa.modo];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
            Vencimento de matrículas
          </h2>
          <Badge tone={modo.tom}>{modo.rotulo}</Badge>
        </div>
        {previa.candidatos.length > 0 && (
          <button
            type="button"
            onClick={vencerAgora}
            disabled={aplicando}
            className="rounded-lg border border-red/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-red-bright transition-colors hover:bg-red-ghost disabled:opacity-60"
          >
            {aplicando ? "Vencendo…" : `Vencer ${previa.candidatos.length} agora`}
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        Vence quem passou {previa.carenciaDias} dias do vencimento do plano sem renovar. Aluno com
        assinatura ativa no Asaas não entra: a mensalidade paga já estende o plano. {modo.texto}
      </p>

      {resultado && <p className="mt-3 text-xs text-ok">{resultado}</p>}
      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      {previa.candidatos.length === 0 ? (
        <p className="mt-4 text-sm text-faint">Nenhuma matrícula vencida além da carência.</p>
      ) : (
        <ul className="mt-4 max-h-[28rem] divide-y divide-border overflow-y-auto">
          {previa.candidatos.map((c) => (
            <li key={c.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <Link href={`/matriculados/${c.personId}`} className="min-w-0 font-medium text-ink hover:underline">
                {c.nome}
                <span className="ml-2 text-xs font-normal text-faint">{c.codigo} · {c.plano}</span>
              </Link>
              <span className="text-xs text-muted">
                venceu {formatData(c.vencimentoPlano)} · há {c.diasVencido} dias
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
