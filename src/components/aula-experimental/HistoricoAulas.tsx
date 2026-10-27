"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatarDataCompleta, formatarHora } from "@/lib/aula-experimental";
import type { AulaExperimentalItem, AulaLegadoItem } from "@/lib/types";
import { BadgeStatus, type TomStatus } from "@/components/ui/editorial";

/**
 * Quem já fez (ou marcou) aula experimental: as aulas do sistema que já
 * passaram e a planilha antiga (jun–out/2026). É aqui que a recepção marca
 * "Veio" / "Faltou" — e isso decide a regra dos 3 dias de aula por pessoa: aula
 * passada sem marcação conta como feita; "Faltou" libera agendar de novo.
 */
type Linha =
  | { origem: "sistema"; chave: string; data: string; aula: AulaExperimentalItem }
  | { origem: "planilha"; chave: string; data: string; l: AulaLegadoItem };

const POR_PAGINA = 60;

const soDig = (s: string) => s.replace(/\D/g, "");
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const PRESENCA: Record<"veio" | "faltou", { tom: TomStatus; rotulo: string }> = {
  veio: { tom: "sucesso", rotulo: "Veio" },
  faltou: { tom: "erro", rotulo: "Faltou" },
};

export function HistoricoAulas({
  aulas,
  legado,
  hoje,
}: {
  aulas: AulaExperimentalItem[];
  legado: AulaLegadoItem[];
  hoje: string;
}) {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<"todas" | "sistema" | "planilha">("todas");
  const [limite, setLimite] = useState(POR_PAGINA);
  // Presença marcada nesta tela (antes do refresh do servidor).
  const [marcadas, setMarcadas] = useState<Record<string, "veio" | "faltou" | null>>({});
  const [erro, setErro] = useState("");

  const linhas = useMemo<Linha[]>(() => {
    const sistema: Linha[] = aulas
      .filter((a) => a.data <= hoje)
      .map((a) => ({ origem: "sistema", chave: `s-${a.id}`, data: a.data, aula: a }));
    const planilha: Linha[] = legado.map((l) => ({
      origem: "planilha",
      chave: `p-${l.id}`,
      data: l.dataAula ?? l.dataVisita ?? "",
      l,
    }));
    return [...sistema, ...planilha].sort((a, b) => b.data.localeCompare(a.data));
  }, [aulas, legado, hoje]);

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    const qd = soDig(busca);
    return linhas.filter((r) => {
      if (origem !== "todas" && r.origem !== origem) return false;
      if (!q) return true;
      const nome = semAcento(r.origem === "sistema" ? r.aula.nome : r.l.nome);
      const fone = soDig(r.origem === "sistema" ? r.aula.telefone : r.l.telefone);
      const cpf = r.origem === "sistema" ? (r.aula.cpf ?? "") : "";
      return nome.includes(q) || (qd.length >= 3 && (fone.includes(qd) || cpf.includes(qd)));
    });
  }, [linhas, busca, origem]);

  async function marcar(id: string, presenca: "veio" | "faltou" | null) {
    setErro("");
    const antes = marcadas[id];
    setMarcadas((m) => ({ ...m, [id]: presenca }));
    try {
      const r = await fetch(`/api/captacao/aulas/${id}/presenca`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presenca }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setMarcadas((m) => ({ ...m, [id]: antes }));
      setErro("Não foi possível salvar a presença. Tente de novo.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(POR_PAGINA);
          }}
          placeholder="Nome, celular ou CPF…"
          aria-label="Buscar no histórico"
          className="min-h-9 min-w-0 flex-1 border border-control bg-painel-2 px-2.5 text-sm text-ink placeholder:text-faint"
        />
        <select
          value={origem}
          onChange={(e) => setOrigem(e.target.value as typeof origem)}
          aria-label="Origem"
          className="min-h-9 border border-control bg-painel-2 px-2.5 text-sm text-ink"
        >
          <option value="todas">Tudo</option>
          <option value="sistema">Agendadas no sistema</option>
          <option value="planilha">Planilha antiga</option>
        </select>
      </div>
      <p className="text-xs text-muted tabular-nums">
        {filtradas.length} registro{filtradas.length === 1 ? "" : "s"} · aula passada sem “Veio/Faltou” conta como feita
      </p>
      {erro && <p className="text-xs text-danger">{erro}</p>}

      <ol className="divide-y divide-border border-y border-border">
        {filtradas.slice(0, limite).map((r) =>
          r.origem === "sistema" ? (
            <ItemSistema
              key={r.chave}
              aula={r.aula}
              presenca={r.aula.id in marcadas ? marcadas[r.aula.id] : r.aula.presenca}
              hoje={hoje}
              onMarcar={(p) => void marcar(r.aula.id, p)}
            />
          ) : (
            <ItemPlanilha key={r.chave} l={r.l} />
          ),
        )}
      </ol>
      {filtradas.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((n) => n + POR_PAGINA)}
          className="self-center text-sm font-medium text-ink underline-offset-2 hover:underline"
        >
          Mostrar mais ({filtradas.length - limite})
        </button>
      )}
      {filtradas.length === 0 && <p className="py-6 text-center text-sm text-muted">Nada encontrado.</p>}
    </div>
  );
}

function Quando({ data, hora }: { data: string | null; hora: number | null }) {
  return (
    <span className="meta-mono w-24 shrink-0 text-xs text-ink tabular-nums">
      {data ? formatarDataCompleta(data) : "—"}
      {hora !== null && <span className="block text-muted">{formatarHora(hora)}</span>}
    </span>
  );
}

function ItemSistema({
  aula,
  presenca,
  hoje,
  onMarcar,
}: {
  aula: AulaExperimentalItem;
  presenca: "veio" | "faltou" | null;
  hoje: string;
  onMarcar: (p: "veio" | "faltou" | null) => void;
}) {
  const botao = (p: "veio" | "faltou", rotulo: string) => (
    <button
      type="button"
      aria-pressed={presenca === p}
      onClick={() => onMarcar(presenca === p ? null : p)}
      className={cn(
        "min-h-8 border px-2.5 text-xs font-medium transition-colors",
        presenca === p
          ? p === "veio"
            ? "border-success bg-success-soft text-ink"
            : "border-danger bg-danger-soft text-ink"
          : "border-control text-muted hover:border-ink hover:text-ink",
      )}
    >
      {rotulo}
    </button>
  );
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <Quando data={aula.data} hora={aula.hora} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{aula.nome}</p>
        <p className="text-xs text-muted">
          {aula.modalidade} · {aula.telefone}
          {aula.cpf && ` · CPF ${aula.cpf.slice(0, 3)}.***.***-${aula.cpf.slice(9)}`}
          {aula.agendadoPor && ` · marcada por ${aula.agendadoPor}`}
          {aula.lembreteEnviadoEm && " · lembrete enviado"}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {aula.data <= hoje ? (
          <>
            {botao("veio", "Veio")}
            {botao("faltou", "Faltou")}
          </>
        ) : (
          <BadgeStatus tom="info">Agendada</BadgeStatus>
        )}
      </div>
    </li>
  );
}

function ItemPlanilha({ l }: { l: AulaLegadoItem }) {
  const detalhes = [
    l.atendente && `atendido por ${l.atendente}`,
    l.comoConheceu && `conheceu por ${l.comoConheceu}`,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <Quando data={l.dataAula ?? l.dataVisita} hora={l.dataAula ? l.hora : null} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {l.nome}
          <span className="ml-2 align-middle text-[0.6875rem] font-normal uppercase tracking-wide text-faint">planilha</span>
        </p>
        <p className="text-xs text-muted">
          {[l.dataAula ? l.modalidade : `Visita${l.modalidade ? ` · ${l.modalidade}` : ""}`, l.telefone, ...detalhes]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {l.andamento && <p className="mt-0.5 text-xs text-ink">“{l.andamento}”</p>}
      </div>
      {l.presenca ? (
        <BadgeStatus tom={PRESENCA[l.presenca].tom}>{PRESENCA[l.presenca].rotulo}</BadgeStatus>
      ) : l.statusOriginal ? (
        <span className="text-xs text-muted">{l.statusOriginal}</span>
      ) : null}
    </li>
  );
}
